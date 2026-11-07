import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { deploymentSettings, shareConfig, requirePublishingBranch } from '../scripts/share-cloudflare.mjs';
import { databaseScopeMatches, cleanupExpiredShares } from '../worker/cleanup';
import { createShareWorker, type D1Statement } from '../worker/index';

const migrations = ['0001_shares', '0002_editable_workspaces', '0003_public_workspace_history'];
function apply(db: DatabaseSync, name: string) {
  db.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
}
function fixture(scope?: string) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrations.forEach(name => apply(db, name));
  if (scope) db.prepare('INSERT INTO share_environment(scope) VALUES(?)').run(scope);
  return db;
}
function adapter(db: DatabaseSync) {
  return { prepare(sql: string): D1Statement {
    let args: any[] = [];
    return { bind(...values: any[]) { args = values; return this; },
      async first<T>() { return (db.prepare(sql).get(...args) || null) as T | null; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    };
  }, async batch(statements: D1Statement[]) { return Promise.all(statements.map(s => s.run())); } };
}

test('Box profile uses only its owner-confirmed database and rejects cross-environment reuse', () => {
  const defaults = deploymentSettings('box-test', {});
  assert.equal(defaults.SHARES_DB_ID, '4d01c6ac-bcf3-4b71-8448-c5d8b8956a34');
  assert.equal(shareConfig('box-test', defaults).d1_databases[0].database_id, defaults.SHARES_DB_ID);
  assert.throws(() => shareConfig('box-test', { ...defaults, SHARES_DB_ID: '' }), /SHARES_DB_ID/);
  for (const tier of ['test', 'beta', 'main']) assert.throws(() => shareConfig(tier, { SHARES_DB_NAME: `med3dviewer-shares-${tier}`, SHARES_RESOURCE_TIER: tier, SHARES_DB_ID: defaults.SHARES_DB_ID }), /box-test database UUID/);
  for (const tier of ['test', 'beta']) {
    assert.throws(() => shareConfig('box-test', { ...defaults, SHARES_DB_ID: deploymentSettings(tier, {}).SHARES_DB_ID }), /database UUID/);
  }
  const config = shareConfig('box-test', { ...defaults, SHARES_DB_ID: '33333333-3333-4333-8333-333333333333' }, '/app');
  assert.equal(config.name, 'ntec3dpo-m3dv-box-test');
  assert.equal(config.workers_dev, true);
  assert.equal(config.previews, undefined);
  assert.equal(config.vars.SHARES_ENVIRONMENT, 'box-test');
  assert.equal(config.d1_databases[0].binding, 'SHARES_DB');
  assert.equal(config.d1_databases[0].database_name, 'med3dviewer-shares-box-test');
  assert.deepEqual(config.triggers.crons, ['17 * * * *']);
  for (const action of ['deploy', 'migrate']) {
    assert.doesNotThrow(() => requirePublishingBranch('box-test', action, 'codex/box-workspace-upload-preview'));
    for (const branch of ['beta', 'main', 'codex/secure-workspace-preview', '']) assert.throws(() => requirePublishingBranch('box-test', action, branch), /only from/);
  }
});

test('migration 0004 preserves populated legacy environments and refuses scope mismatch cleanup', async () => {
  for (const scope of ['test', 'beta', 'main']) {
    const db = fixture(scope);
    try {
      db.prepare('INSERT INTO share_users VALUES(?,?,?,?,?,?,?)').run('ab'.repeat(32), 'legacy-user', 'salt', 'cd'.repeat(32), 1, 1, 1);
      db.prepare('INSERT INTO share_rate_limits VALUES(?,?,?)').run('sentinel', 1, 0);
      db.prepare('INSERT INTO shares(token_hash,source_ciphertext,model_extension,model_identity,workspace_json,owner_ref,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run('ef'.repeat(32), 'encrypted-source', '3mf', 'aa'.repeat(32), '{}', 'legacy-owner', 1, 1000);
      db.prepare('INSERT INTO share_revisions VALUES(?,?,?,?,?,?,?)').run('ef'.repeat(32), 1, '{}', 2, 'Legacy revision', 1, 'save-original');
      const before = JSON.stringify(db.prepare('SELECT * FROM shares').get());
      apply(db, '0004_box_test_scope');
      assert.equal(JSON.stringify(db.prepare('SELECT * FROM shares').get()), before);
      assert.equal((db.prepare('SELECT author FROM share_revisions').get() as any).author, 'Legacy revision');
      assert.equal((db.prepare('SELECT scope FROM share_environment').get() as any).scope, scope);
      assert.equal((db.prepare('SELECT version FROM share_schema_version').get() as any).version, 4);
      assert.equal((db.prepare('SELECT username FROM share_users').get() as any).username, 'legacy-user');
      const env = { SHARES_DB: adapter(db), SHARES_ENVIRONMENT: 'box-test' };
      assert.equal(await databaseScopeMatches(env), false);
      await cleanupExpiredShares(env, 100);
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM share_rate_limits').get() as any).n, 1);
    } finally { db.close(); }
  }
});

test('empty Box database must be initialized explicitly and runtime requires matching scope and secrets', async () => {
  const db = fixture();
  try {
    apply(db, '0004_box_test_scope');
    const env = { SHARES_DB: adapter(db), SHARES_ENVIRONMENT: 'box-test', SHARES_ENABLED: 'true', SHARES_CREATE_KEY: 'a'.repeat(64), SHARES_ENCRYPTION_KEY: 'b'.repeat(64) };
    const worker = createShareWorker();
    const get = () => worker.fetch(new Request('https://test.example/api/shares/config'), env);
    assert.equal((await (await get()).json() as any).enabled, false);
    db.exec("INSERT INTO share_environment(scope) VALUES('box-test')");
    assert.equal((await (await get()).json() as any).enabled, true);
    assert.equal(await databaseScopeMatches({ ...env, SHARES_ENVIRONMENT: 'beta' }), false);
    env.SHARES_ENCRYPTION_KEY = '';
    assert.equal((await (await get()).json() as any).enabled, false);
    assert.throws(() => db.exec("UPDATE share_environment SET scope='arbitrary'"), /CHECK/);
  } finally { db.close(); }
});
