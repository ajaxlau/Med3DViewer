import test from 'node:test';
import assert from 'node:assert/strict';
import { shareConfig } from '../scripts/share-cloudflare.mjs';

const id = 'a1234567-1234-1234-1234-123456789abc';
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
    assert.equal('previews' in config,tier==='beta');
    assert.equal('triggers' in config,tier!=='beta');
    if(tier==='beta') {
      assert.equal(config.previews.d1_databases[0].database_id,id);
      assert.equal(config.previews.vars.SHARES_ENVIRONMENT,'beta');
    }
    assert.equal('SHARES_CREATE_KEY' in config.vars,false);
  }
});
