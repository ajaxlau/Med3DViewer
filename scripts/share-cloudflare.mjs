import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function shareConfig(target, env = process.env, root = process.cwd()) {
  if (!['test', 'beta', 'main'].includes(target)) throw new Error('Target must be test, beta, or main.');
  const database_name = `med3dviewer-shares-${target}`;
  if (env.SHARES_DB_NAME !== database_name) throw new Error(`Set SHARES_DB_NAME=${database_name} for this target.`);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(env.SHARES_DB_ID || '') || /^0+-/.test(env.SHARES_DB_ID)) {
    throw new Error('Set SHARES_DB_ID to the non-secret database UUID from Cloudflare D1.');
  }
  if (env.SHARES_RESOURCE_TIER !== target) throw new Error(`Set SHARES_RESOURCE_TIER=${target}; resource tiers cannot be reused implicitly.`);
  /** @type {Record<string, any>} */
  const config = {
    name: target === 'test' ? 'ntec3dpo-m3dv-sharing-test' : 'ntec3dpo-m3dv',
    main: resolve(root, 'worker/entry.ts'),
    compatibility_date: '2026-10-03',
    assets: { directory: resolve(root, 'dist'), binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/shares', '/api/shares/*', '/s/*'] },
    vars: { SHARES_ENABLED: 'true', SHARES_ENVIRONMENT: target },
    d1_databases: [{ binding: 'SHARES_DB', database_name, database_id: env.SHARES_DB_ID, migrations_dir: resolve(root, 'migrations') }],
    // Only production Workers receive scheduled events. Preview cleanup is manual
    // through D1 until scheduled handlers are supported for Worker Previews.
    ...(target === 'beta' ? { previews: {} } : { triggers: { crons: ['17 * * * *'] } }),
    observability: { enabled: false },
  };
  // Worker Previews do not inherit top-level resource bindings or variables.
  // Keep the top-level D1 declaration too, for the explicit migration command.
  if (target === 'beta') config.previews = { vars: config.vars, d1_databases: config.d1_databases, observability: { enabled: false } };
  return config;
}

async function main() {
  const [target, action = 'configure'] = process.argv.slice(2);
  if (!['configure', 'check', 'deploy', 'preview', 'migrate', 'cleanup'].includes(action)) throw new Error('Unknown share configuration action.');
  if (action === 'cleanup' && target !== 'beta') throw new Error('Standalone cleanup is only needed for beta Previews.');
  if ((target === 'beta' && action === 'deploy') || (target !== 'beta' && action === 'preview')) throw new Error('Beta uses preview; test/main use deploy.');
  const config = shareConfig(target);
  if (action === 'cleanup') {
    config.name = 'ntec3dpo-m3dv-sharing-beta-cleanup';
    config.main = resolve('worker/cleanup-entry.ts');
    delete config.assets;
    delete config.previews;
    config.vars = { SHARES_ENVIRONMENT: 'beta' };
    config.triggers = { crons: ['17 * * * *'] };
  }
  await mkdir('.share-config', { recursive: true });
  const path = resolve('.share-config', `${target}${action === 'cleanup' ? '-cleanup' : ''}.json`);
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  if (action === 'configure') { process.stdout.write(`Created .share-config/${target}.json (no secrets).\n`); return; }
  const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
  const args = action === 'migrate' ? ['d1', 'migrations', 'apply', 'SHARES_DB', '--remote'] : action === 'preview' ? ['preview'] : ['deploy', ...(action === 'check' ? ['--dry-run'] : [])];
  const result = spawnSync(process.execPath, [wrangler, ...args, '--config', path], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
