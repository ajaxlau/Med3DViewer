import test from 'node:test';
import assert from 'node:assert/strict';
import { modelOnlySnapshot,ModelShareLinkCache,modelShareLinks } from '../src/lib/modelShareLinks';
const link=(id='a',expiresAt='2099-01-01T00:00:00Z')=>({token:id.repeat(64),url:`https://viewer.example/s/${id.repeat(64)}`,expiresAt});
test('plain model sharing captures the model frame without exporting any planning objects',()=>{
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,12,0,0,1];let updated=false;
  const manager={getModelRoot:()=>({updateMatrixWorld(){updated=true;},matrixWorld:{toArray:()=>matrix}}),exportShareWorkspace(){throw new Error('Local-only objects must not block plain model sharing.');}};
  const result=modelOnlySnapshot(manager);assert(updated);assert.deepEqual(result.modelMatrix,matrix);assert.deepEqual(result.objects,[]);assert.deepEqual(result.groups,[]);assert.equal(result.meshes,undefined);
});
test('closing and reopening share reuses one in-flight or completed model link',async()=>{
  const manager={},cache=modelShareLinks(manager);assert.equal(cache,modelShareLinks(manager));let calls=0;
  const create=async()=>{calls++;return link();};
  const [first,second]=await Promise.all([cache.get('model',create),cache.get('model',create)]);assert.equal(first,second);assert.equal(calls,1);
  assert.equal(await cache.get('model',create),first);assert.equal(calls,1);
});
test('failed and expired automatic links can be retried without using a stale result',async()=>{
  let now=0,calls=0;const cache=new ModelShareLinkCache(()=>now);
  await assert.rejects(cache.get('failed',async()=>{throw new Error('offline');}),/offline/);
  await cache.get('failed',async()=>link());
  const create=async()=>{calls++;return link(calls===1?'a':'b',new Date(now+1000).toISOString());};
  assert.equal((await cache.get('expiry',create)).token,'a'.repeat(64));now=1001;assert.equal((await cache.get('expiry',create)).token,'b'.repeat(64));assert.equal(calls,2);
});
test('the per-viewer cache stays bounded when different models are shared',async()=>{
  const cache=new ModelShareLinkCache();let calls=0;
  const create=async()=>{calls++;return link();};
  for(let i=0;i<9;i++)await cache.get(String(i),create);
  await cache.get('0',create);assert.equal(calls,10);
});
