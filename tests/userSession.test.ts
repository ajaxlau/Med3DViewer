import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserSession,loginUser,logoutUser,validateUserSession } from '../src/lib/userSession';
const user=()=>({id:'a'.repeat(64),username:'test.sharer',permissions:['workspace:share'],expiresAt:'2099-01-01T00:00:00.000Z'});
test('user-session responses expose only a validated identity and capability list',()=>{
  assert.deepEqual(validateUserSession({authenticated:false,enabled:true}),{enabled:true,user:null});
  const response=validateUserSession({authenticated:true,enabled:true,user:{...user(),password:'do-not-return',cookie:'do-not-return'}});
  assert.deepEqual(response.user,user());
  for(const changes of [{id:'not-an-id'},{id:['a'.repeat(64)]},{username:['test.sharer']},{username:'<script>'},{permissions:['workspace:share','workspace:share']},{permissions:['*']},{expiresAt:'2000-01-01T00:00:00Z'}])assert.throws(()=>validateUserSession({authenticated:true,enabled:true,user:{...user(),...changes}}));
});
test('login and refresh use same-origin HttpOnly cookies without exposing a session token to JavaScript',async t=>{
  const paths:string[]=[];
  t.mock.method(globalThis,'fetch',async(path:string,init:RequestInit)=>{
    paths.push(path);assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
    assert.equal((init.headers as any)?.Authorization,undefined);
    if(path.endsWith('/login'))assert.deepEqual(JSON.parse(String(init.body)),{username:'test.sharer',password:'test-assigned-sharing-password'});
    return new Response(JSON.stringify({authenticated:true,enabled:true,user:user()}));
  });
  await loginUser('test.sharer','test-assigned-sharing-password',new AbortController().signal);
  const session=await getUserSession(new AbortController().signal);assert.equal(session.user?.username,'test.sharer');
  assert.deepEqual(paths,['/api/shares/login','/api/shares/session']);
});
test('logout is a same-origin POST and invalid credentials fail before a network request',async t=>{
  let requests=0;
  t.mock.method(globalThis,'fetch',async(path:string,init:RequestInit)=>{requests++;assert.equal(path,'/api/shares/logout');assert.equal(init.method,'POST');return new Response('{"authenticated":false}');});
  assert.throws(()=>loginUser('test.sharer','short',new AbortController().signal));assert.equal(requests,0);
  await logoutUser(new AbortController().signal);assert.equal(requests,1);
});
