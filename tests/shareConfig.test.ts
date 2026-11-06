import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentSettings, shareConfig, cleanupConfig, requirePublishingBranch } from '../scripts/share-cloudflare.mjs';
import { readFileSync } from 'node:fs';

const id = 'a1234567-1234-1234-1234-123456789abc';
test('the recorded test database cannot become a beta or production default', () => {
  const settings = deploymentSettings('test', {});
  assert.equal(settings.SHARES_DB_ID, '5645e9dd-918f-4bbc-a0d6-9e1c315c27ca');
  assert.equal(shareConfig('test', settings).d1_databases[0].database_name, 'med3dviewer-shares-test');
  const beta = deploymentSettings('beta', {});
  assert.equal(beta.SHARES_DB_ID,'d23f95bc-a6a2-4f43-9fa9-5afaa340f325');
  assert.equal(shareConfig('beta',beta).d1_databases[0].database_name,'med3dviewer-shares-beta');
  assert.notEqual(beta.SHARES_DB_ID,settings.SHARES_DB_ID);
  assert.deepEqual(deploymentSettings('main', {}), {});
  assert.throws(() => shareConfig('main', deploymentSettings('main', {})), /SHARES_DB_NAME/);
  assert.throws(() => shareConfig('test', deploymentSettings('test', { SHARES_RESOURCE_TIER:'main' })), /SHARES_RESOURCE_TIER/);
});
test('promotion restores the existing root Worker and never enables sharing by default', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'ntec3dpo-m3dv');
  assert.equal(config.vars.SHARES_ENABLED, 'false');
  assert.equal(config.previews.vars.SHARES_ENABLED, 'false');
  assert.equal(config.d1_databases, undefined);
});
test('renaming the test binding cannot promote its physical database', () => {
  for (const tier of ['beta', 'main']) assert.throws(() => shareConfig(tier, {
    SHARES_DB_NAME:`med3dviewer-shares-${tier}`, SHARES_DB_ID:deploymentSettings('test', {}).SHARES_DB_ID, SHARES_RESOURCE_TIER:tier,
  }), /test database UUID/);
  assert.throws(()=>shareConfig('main', {SHARES_DB_NAME:'med3dviewer-shares-main',SHARES_DB_ID:deploymentSettings('beta',{}).SHARES_DB_ID,SHARES_RESOURCE_TIER:'main'}),/beta database UUID/);
  assert.throws(()=>shareConfig('test', {...deploymentSettings('test',{}),SHARES_DB_ID:deploymentSettings('beta',{}).SHARES_DB_ID}),/beta database UUID/);
});
test('beta cleanup shares only the explicit beta database and has no public routes or secrets', () => {
  const config = cleanupConfig({SHARES_DB_NAME:'med3dviewer-shares-beta', SHARES_DB_ID:id, SHARES_RESOURCE_TIER:'beta'}, '/app');
  assert.equal(config.name,'ntec3dpo-m3dv-sharing-beta-cleanup');
  assert.equal(config.d1_databases[0].database_id,id);
  assert.deepEqual(config.vars,{SHARES_ENVIRONMENT:'beta'});
  assert.deepEqual(config.triggers.crons,['17 * * * *']);
  assert.equal(config.assets,undefined);assert.equal(config.previews,undefined);
  assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);
});
test('publishing beta and main rejects an unrelated or unknown source branch', () => {
  for (const [tier,action] of [['beta','preview'],['beta','cleanup'],['main','deploy']]) {
    assert.doesNotThrow(()=>requirePublishingBranch(tier,action,tier));
    for (const branch of ['codex/secure-workspace-preview','',tier==='beta'?'main':'beta']) assert.throws(()=>requirePublishingBranch(tier,action,branch),/only from/);
  }
  for (const action of ['configure','check','cleanup-check','migrate']) assert.doesNotThrow(()=>requirePublishingBranch('beta',action,'feature'));
  assert.doesNotThrow(()=>requirePublishingBranch('test','deploy','codex/secure-workspace-preview'));
});
test('share deployments require an explicit matching resource tier and database', () => {
  assert.throws(() => shareConfig('test', {}), /SHARES_DB_NAME/);
  assert.throws(() => shareConfig('test', {SHARES_DB_NAME:'med3dviewer-shares-main',SHARES_DB_ID:id,SHARES_RESOURCE_TIER:'test'}), /SHARES_DB_NAME/);
  assert.throws(() => shareConfig('beta', {SHARES_DB_NAME:'med3dviewer-shares-beta',SHARES_DB_ID:id,SHARES_RESOURCE_TIER:'main'}), /SHARES_RESOURCE_TIER/);
  assert.throws(() => shareConfig('main', {SHARES_DB_NAME:'med3dviewer-shares-main',SHARES_DB_ID:'',SHARES_RESOURCE_TIER:'main'}), /SHARES_DB_ID/);
});
test('share deployment targets isolate names, scope and Worker Previews', () => {
  for (const tier of ['test','beta','main']) {
    const config = shareConfig(tier, {SHARES_DB_NAME:`med3dviewer-shares-${tier}`,SHARES_DB_ID:id,SHARES_RESOURCE_TIER:tier}, '/app');
    assert.equal(config.vars.SHARES_ENVIRONMENT,tier);
    assert.equal(config.d1_databases[0].database_name,`med3dviewer-shares-${tier}`);
    assert.equal(config.name,tier==='test'?'ntec3dpo-m3dv-sharing-test':'ntec3dpo-m3dv');
    assert.equal(config.workers_dev,tier==='test'?true:undefined);
    assert.equal('previews' in config,tier==='beta');
    assert.equal('triggers' in config,tier!=='beta');
    if(tier==='beta') {
      assert.equal(config.previews.d1_databases[0].database_id,id);
      assert.equal(config.previews.vars.SHARES_ENVIRONMENT,'beta');
    }
    assert.equal('SHARES_CREATE_KEY' in config.vars,false);
  }
});
