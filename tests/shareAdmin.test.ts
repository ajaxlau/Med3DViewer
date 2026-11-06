import test from 'node:test';
import assert from 'node:assert/strict';
import { listManagedWorkspaces, revokeManagedWorkspace, updateManagedWorkspace } from '../src/lib/shareAdmin';

const id='a'.repeat(64),password='synthetic-admin-password-'.repeat(2),origin='https://viewer.example';
Object.defineProperty(globalThis,'window',{configurable:true,value:{location:new URL(origin)}});
const row=()=>({id,label:'Synthetic workspace',format:'3mf',createdAt:1_800_000_000_000,updatedAt:1_800_000_000_000,expiresAt:1_800_086_400_000,revokedAt:null,revision:1,viewUrl:`${origin}/s/${'b'.repeat(64)}`,maxExpiresAt:1_815_552_000_000});
test('admin listing uses header-only authentication, validates returned links and never accepts an external address',async t=>{
  let hostile=false;
  t.mock.method(globalThis,'fetch',async(path:string,init:RequestInit)=>{
    assert.equal(path,'/api/shares/admin');assert.equal((init.headers as any).Authorization,`Bearer ${password}`);assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
    return new Response(JSON.stringify({items:[{...row(),...(hostile?{viewUrl:'https://attacker.example/model'}:{})}],nextCursor:null}));
  });
  const result=await listManagedWorkspaces(password,new AbortController().signal);assert.equal(result.items[0].format,'3mf');
  hostile=true;await assert.rejects(listManagedWorkspaces(password,new AbortController().signal),/address/);
});
test('admin setting changes carry a revision; revoke is a distinct authenticated action',async t=>{
  const methods:string[]=[];
  t.mock.method(globalThis,'fetch',async(path:string,init:RequestInit)=>{
    assert.equal(path,`/api/shares/admin/${id}`);methods.push(init.method!);
    assert.equal((init.headers as any).Authorization,`Bearer ${password}`);
    if(init.method==='DELETE')return new Response(null,{status:204});
    assert.equal(JSON.parse(String(init.body)).revision,3);return new Response('{}');
  });
  await updateManagedWorkspace(id,password,{revision:3,label:'Reviewed',expiresAt:'2027-01-01T00:00:00.000Z'},new AbortController().signal);
  await revokeManagedWorkspace(id,password,new AbortController().signal);
  assert.deepEqual(methods,['PATCH','DELETE']);
});
