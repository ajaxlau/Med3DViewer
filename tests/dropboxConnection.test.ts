import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createShareWorker, type ShareEnvironment, type D1Statement } from '../worker/index';
import { dropboxAccessToken, maintainDropboxConnection } from '../worker/dropboxConnection';
const origin = 'https://ntec3dpo-m3dv-box-test.x-panda.workers.dev';
const admin = 'synthetic-admin-'.repeat(4), folder = '';
const token = (suffix = '') => ({ access_token: 'test-access-secret' + suffix, refresh_token: 'test-refresh-secret' + suffix, expires_in: 3600, scope: 'account_info.read files.metadata.read files.content.read files.content.write' });
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001_shares','0002_editable_workspaces','0003_public_workspace_history','0004_box_test_scope','0005_box_connection','0006_dropbox_connection']) db.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url),'utf8'));
  db.exec("INSERT INTO share_environment(scope) VALUES('box-test')");
  const adapter = { prepare(sql: string): D1Statement { let values: any[] = []; return {
    bind(...args: any[]) { values = args; return this; },
    async first<T>() { return (db.prepare(sql).get(...values) || null) as T | null; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
  }; }, async batch(statements: D1Statement[]) { const result = []; db.exec('BEGIN'); try { for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } } };
  const env: ShareEnvironment = { SHARES_DB: adapter, SHARES_ENABLED: 'true', SHARES_ENVIRONMENT: 'box-test', SHARES_CREATE_KEY: admin, SHARES_ENCRYPTION_KEY: 'b'.repeat(64), BOX_ENABLED: 'false', DROPBOX_ENABLED: 'true', DROPBOX_ORIGIN: origin, DROPBOX_FOLDER_PATH: folder, DROPBOX_APP_KEY: 'synthetic-client-id', DROPBOX_APP_SECRET: 'synthetic-client-secret', DROPBOX_CREDENTIALS_KEY: 'c'.repeat(64) };
  let clock = Date.UTC(2026,10,7), calls = 0, account = 'dbid:original-account', upload = true;
  let tokenHook: (() => Promise<void>) | null = null;
  let omitScope = false;
  let providerFailure: {path:string;status:number;body:string} | null = null;
  const files = new Map<string, Uint8Array>(); let badDownload = false, failCleanup = false;
  const upstream = async (input: any, init: RequestInit) => {
    calls++;
    const url = String(input); assert.equal(init.redirect, 'error');
    if(providerFailure && url.endsWith(providerFailure.path)) return new Response(providerFailure.body,{status:providerFailure.status});
    if (url.endsWith('/oauth2/token')) {
      assert.equal(init.method, 'POST');
      if (tokenHook) { const hook = tokenHook; tokenHook = null; await hook(); }
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get('client_secret'), env.DROPBOX_APP_SECRET);
      const value: any = token(body.get('grant_type') === 'refresh_token' ? '-rotated' : '');
      if (!upload) value.scope = 'account_info.read files.metadata.read';
      if (omitScope) delete value.scope;
      if (body.get('grant_type') === 'refresh_token') { assert.equal(body.get('refresh_token'),'test-refresh-secret'); delete value.refresh_token; }
      return new Response(JSON.stringify(value));
    }
    assert.equal((init.headers as any).Authorization?.startsWith('Bearer test-access-secret'), true);
    if (url.endsWith('/files/upload')) {
      const args=JSON.parse((init.headers as any)['Dropbox-API-Arg']);
      assert.match(args.path,/^\/med3dviewer-connection-test-[a-f0-9]{64}\.txt$/);assert.equal(args.mode,'add');assert.equal(args.autorename,false);
      const bytes=new Uint8Array(init.body as Uint8Array);files.set(args.path,bytes);return new Response(JSON.stringify({path_lower:args.path,size:bytes.length}));
    }
    if (url.endsWith('/files/download')) { const args=JSON.parse((init.headers as any)['Dropbox-API-Arg']);return new Response(badDownload?'different bytes':files.get(args.path)); }
    if (url.endsWith('/files/delete_v2')) {if(failCleanup)return new Response('{}',{status:500});const args=JSON.parse(String(init.body));assert.match(args.path,/^\/med3dviewer-connection-test-[a-f0-9]{64}\.txt$/);files.delete(args.path);return new Response('{}');}
    if (url.endsWith('/users/get_current_account')) return new Response(JSON.stringify({ account_id: account, name: { display_name: 'Synthetic test account' } }));
    assert.equal(url, 'https://api.dropboxapi.com/2/files/list_folder');
    assert.deepEqual(JSON.parse(String(init.body)), {path: '',limit:1,recursive:false});
    return new Response(JSON.stringify({ entries: [], cursor: 'private-cursor' }));
  };
  const worker = createShareWorker({ now: () => clock, fetch: upstream as typeof fetch });
  const request = (path: string, method = 'GET', auth = true, cookie = '', requestOrigin = origin) => new Request(origin + path, { method, headers: { ...(auth ? { Authorization: `Bearer ${admin}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { Origin: requestOrigin } : {}) } });
  async function start() {
    const r = await worker.fetch(request('/api/shares/admin/dropbox/connect','POST'), env);
    assert.equal(r.status,200,await r.clone().text());
    const url = new URL((await r.json() as any).authorizationUrl);
    assert.equal(url.origin,'https://www.dropbox.com'); assert.equal(url.searchParams.get('redirect_uri'), origin + '/api/shares/dropbox/callback');assert.equal(url.searchParams.get('token_access_type'),'offline');
    const cookie = r.headers.get('Set-Cookie')!;
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Lax/); assert.match(cookie,/Secure/);
    return { state: url.searchParams.get('state')!, cookie: cookie.split(';')[0] };
  }
  const callback = (s: {state:string;cookie:string}, extra = '&code=synthetic-code') => request('/api/shares/dropbox/callback?state=' + s.state + extra,'GET',false,s.cookie);
  async function connect() { const s = await start(); const response = await worker.fetch(callback(s),env); assert.equal(response.headers.get('Location'),'/admin/shares?dropbox=connected'); return s; }
  return { db,env,worker,request,start,callback,connect,upstream:upstream as typeof fetch,get calls(){return calls;},advance(ms:number){clock+=ms;},get now(){return clock;},setAccount(id:string){account=id;},denyUpload(){upload=false;},onToken(hook:()=>Promise<void>){tokenHook=hook;},get diagnosticFiles(){return files.size;},corruptDownload(){badDownload=true;},failCleanup(){failCleanup=true;},failProvider(path:string,status:number,body:string){providerFailure={path,status,body};},omitTokenScope(){omitScope=true;} };
}
test('Dropbox administrator endpoints reject anonymous and cross-origin requests before provider access',async()=>{
  const f=fixture();try {
    for(const path of ['/api/shares/admin/dropbox','/api/shares/admin/dropbox/connect','/api/shares/admin/dropbox/check','/api/shares/admin/dropbox/transfer-test','/api/shares/admin/dropbox/disconnect']) assert.equal((await f.worker.fetch(f.request(path,path.endsWith('/dropbox')?'GET':'POST',false),f.env)).status,401);
    assert.equal((await f.worker.fetch(f.request('/api/shares/admin/dropbox/connect','POST',true,'','https://evil.example'),f.env)).status,403);
    assert.equal(f.calls,0);
  }finally{f.db.close();}
});
test('Dropbox setup requires distinct credentials, matching environment and migration before connecting',async()=>{
  const f=fixture();try {
    const status=async()=>await (await f.worker.fetch(f.request('/api/shares/admin/dropbox'),f.env)).json() as any;
    f.env.DROPBOX_CREDENTIALS_KEY=f.env.SHARES_ENCRYPTION_KEY;assert.equal((await status()).enabled,false);
    f.env.DROPBOX_CREDENTIALS_KEY='c'.repeat(64);f.db.exec("UPDATE share_environment SET scope='beta'");assert.equal((await f.worker.fetch(f.request('/api/shares/admin/dropbox'),f.env)).status,503);
    f.db.exec("UPDATE share_environment SET scope='box-test'; UPDATE share_schema_version SET version=4");assert.equal((await status()).enabled,false);
    assert.equal(f.calls,0);
  }finally{f.db.close();}
});
test('OAuth state is hashed, browser-bound, single use and credentials are encrypted and sanitized',async()=>{
  const f=fixture();try {
    const s=await f.start(), pending=JSON.stringify(f.db.prepare('SELECT * FROM dropbox_oauth_states').get());
    assert(!pending.includes(s.state));assert(!pending.includes(s.cookie.split('=')[1]));
    assert.equal((await f.worker.fetch(f.callback({...s,cookie:''}),f.env)).status,400);assert.equal(f.calls,0);
    assert.equal((await f.worker.fetch(f.callback(s),f.env)).headers.get('Location'),'/admin/shares?dropbox=connected');
    const stored=JSON.stringify(f.db.prepare('SELECT * FROM dropbox_connection').get());
    assert(!stored.includes('test-access-secret'));assert(!stored.includes('test-refresh-secret'));assert(!stored.includes('synthetic-client-secret'));
    const status=await (await f.worker.fetch(f.request('/api/shares/admin/dropbox'),f.env)).text();assert(!status.includes('credentials'));assert(!status.includes('secret'));
    assert.equal(await dropboxAccessToken(f.env,f.upstream,f.now),'test-access-secret');
    const row=f.db.prepare('SELECT * FROM dropbox_connection').get() as any; assert(row.credentials);
    const count=f.calls;assert.equal((await f.worker.fetch(f.callback(s),f.env)).status,400);assert.equal(f.calls,count);
  }finally{f.db.close();}
});
test('expired, duplicate and stale authorization callbacks never call Dropbox',async()=>{
  const f=fixture();try {
    const first=await f.start(), second=await f.start();
    assert.equal((await f.worker.fetch(f.callback(first),f.env)).status,400);
    assert.equal((await f.worker.fetch(f.callback(second,'&code=a&code=b'),f.env)).status,400);
    f.advance(600001);assert.equal((await f.worker.fetch(f.callback(second),f.env)).status,400);assert.equal(f.calls,0);
  }finally{f.db.close();}
});
test('denied authorization and missing content scopes yield safe failure redirects without secrets',async()=>{
  const f=fixture();try {
    let s=await f.start();let r=await f.worker.fetch(f.callback(s,'&error=access_denied&error_description=SECRET'),f.env);
    assert.equal(r.status,303);assert.match(r.headers.get('Location')!, /^\/admin\/shares\?dropbox=failed&stage=/);assert.equal(f.calls,0);
    s=await f.start();f.denyUpload();r=await f.worker.fetch(f.callback(s),f.env);assert.match(r.headers.get('Location')!, /^\/admin\/shares\?dropbox=failed&stage=/);
    assert.equal((f.db.prepare('SELECT credentials FROM dropbox_connection').get() as any).credentials,null);
  }finally{f.db.close();}
});
test('disconnect invalidates pending callbacks and keeps the account pin for reconnection',async()=>{
  const f=fixture();try {
    await f.connect();const pending=await f.start();
    assert.equal((await f.worker.fetch(f.request('/api/shares/admin/dropbox/disconnect','POST'),f.env)).status,200);
    const count=f.calls;assert.equal((await f.worker.fetch(f.callback(pending),f.env)).status,400);assert.equal(f.calls,count);
    assert.equal((f.db.prepare('SELECT credentials FROM dropbox_connection').get() as any).credentials,null);
    f.setAccount('98765');const s=await f.start();assert.match((await f.worker.fetch(f.callback(s),f.env)).headers.get('Location')!, /^\/admin\/shares\?dropbox=failed&stage=/);
    assert.equal((f.db.prepare('SELECT account_id FROM dropbox_connection').get() as any).account_id,'dbid:original-account');
  }finally{f.db.close();}
});
test('concurrent refresh has one provider call and preserves the offline refresh token when the provider omits it',async()=>{
  const f=fixture();try {
    await f.connect();f.advance(3600_000);const before=f.calls;
    const result=await Promise.allSettled([dropboxAccessToken(f.env,f.upstream,f.now),dropboxAccessToken(f.env,f.upstream,f.now)]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls-before,1);
    assert.equal(await dropboxAccessToken(f.env,f.upstream,f.now),'test-access-secret-rotated');
    f.advance(3600_000);assert.equal(await dropboxAccessToken(f.env,f.upstream,f.now),'test-access-secret-rotated');
    assert(!JSON.stringify(f.db.prepare('SELECT * FROM dropbox_connection').get()).includes('rotated'));
  }finally{f.db.close();}
});
test('failed or lost refresh responses require reconnection and are never retried automatically',async()=>{
  const f=fixture();try {
    await f.connect();f.advance(3600_000);let calls=0;
    const failing=async()=>{calls++;throw new Error('synthetic-secret-provider-error');};
    await assert.rejects(()=>dropboxAccessToken(f.env,failing as any,f.now),/Dropbox could not/);
    await assert.rejects(()=>dropboxAccessToken(f.env,failing as any,f.now),/Connect the Dropbox/);assert.equal(calls,1);
    assert.equal((f.db.prepare('SELECT status FROM dropbox_connection').get() as any).status,'reconnect');
  }finally{f.db.close();}
});
test('scheduled upkeep rotates an idle connection for offline authorization',async()=>{
  const f=fixture();try {
    await f.connect();f.advance(11*86400_000);const before=f.calls;
    await maintainDropboxConnection(f.env,f.upstream,f.now);assert.equal(f.calls-before,1);
    assert.equal((f.db.prepare('SELECT status FROM dropbox_connection').get() as any).status,'connected');
    assert((f.db.prepare('SELECT refresh_due_at FROM dropbox_connection').get() as any).refresh_due_at>f.now);
  }finally{f.db.close();}
});
test('a crashed refresh lock is never taken over with the previous credentials',async()=>{
  const f=fixture();try {
    await f.connect();f.db.prepare("UPDATE dropbox_connection SET status='refreshing',lock_id='lost',lock_at=?").run(f.now-61000);
    const count=f.calls;await assert.rejects(()=>dropboxAccessToken(f.env,f.upstream,f.now),/refreshing/);assert.equal(f.calls,count);
    assert.equal((f.db.prepare('SELECT status FROM dropbox_connection').get() as any).status,'reconnect');
  }finally{f.db.close();}
});
test('credential-key changes and folder changes stop access rather than using mismatched credentials',async()=>{
  const f=fixture();try {
    await f.connect();const count=f.calls;f.env.DROPBOX_FOLDER_PATH='999';await assert.rejects(()=>dropboxAccessToken(f.env,f.upstream,f.now),/setup/);
    f.env.DROPBOX_FOLDER_PATH=folder;f.env.DROPBOX_CREDENTIALS_KEY='d'.repeat(64);await assert.rejects(()=>dropboxAccessToken(f.env,f.upstream,f.now),/credential configuration/);assert.equal(f.calls,count);
  }finally{f.db.close();}
});

test('disconnect during code exchange or refresh cannot resurrect saved credentials',async()=>{
  for(const refresh of [false,true]){
    const f=fixture();try {
      if(refresh)await f.connect();
      const pending=refresh?null:await f.start();
      f.onToken(async()=>{assert.equal((await f.worker.fetch(f.request('/api/shares/admin/dropbox/disconnect','POST'),f.env)).status,200);});
      if(refresh){f.advance(3600_000);await assert.rejects(()=>dropboxAccessToken(f.env,f.upstream,f.now),/connection changed/);}
      else assert.match((await f.worker.fetch(f.callback(pending!),f.env)).headers.get('Location')!, /^\/admin\/shares\?dropbox=failed&stage=/);
      const row=f.db.prepare('SELECT status,credentials FROM dropbox_connection').get() as any;
      assert.equal(row.status,'disconnected');assert.equal(row.credentials,null);
    }finally{f.db.close();}
  }
});

test('explicit transfer test creates, verifies and removes only a small generated diagnostic file',async()=>{
 const f=fixture();try {
  await f.connect();const before=f.calls;
  const response=await f.worker.fetch(f.request('/api/shares/admin/dropbox/transfer-test','POST'),f.env);
  assert.equal(response.status,200,await response.clone().text());assert.equal(f.calls-before,3);assert.equal(f.diagnosticFiles,0);
  assert.deepEqual(await response.json(),{ok:true});
 }finally{f.db.close();}
});
test('transfer corruption is reported and cleanup is attempted; cleanup failure is reported separately',async()=>{
 for(const cleanup of [false,true]) {
  const f=fixture();try {
   await f.connect();if(cleanup)f.failCleanup();else f.corruptDownload();
   const r=await f.worker.fetch(f.request('/api/shares/admin/dropbox/transfer-test','POST'),f.env);
   assert.equal(r.status,502);const error=await r.json() as any;
   assert.equal(error.error.code,cleanup?'DROPBOX_TEST_CLEANUP':'DROPBOX_TEST_FAILED');assert.equal(f.diagnosticFiles,cleanup?1:0);
   assert(!JSON.stringify(error).includes('test-access-secret'));
  }finally{f.db.close();}
 }
});
test('Dropbox activation cannot run alongside Box or outside its test scope',async()=>{
 const f=fixture();try {
  f.env.BOX_ENABLED='true';assert.equal((await (await f.worker.fetch(f.request('/api/shares/admin/dropbox'),f.env)).json() as any).enabled,false);
  f.env.BOX_ENABLED='false';f.env.SHARES_ENVIRONMENT='beta';f.db.exec("UPDATE share_environment SET scope='beta'");
  assert.equal((await (await f.worker.fetch(f.request('/api/shares/admin/dropbox'),f.env)).json() as any).enabled,false);assert.equal(f.calls,0);
 }finally{f.db.close();}
});

test('migration 0006 preserves populated schema-5 users, workspaces and historical Box metadata',()=>{
 const db=new DatabaseSync(':memory:');try {
  db.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0001_shares','0002_editable_workspaces','0003_public_workspace_history','0004_box_test_scope','0005_box_connection'])db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
  db.exec("INSERT INTO share_environment(scope) VALUES('box-test')");
  db.prepare('INSERT INTO share_users VALUES(?,?,?,?,?,?,?)').run('aa'.repeat(32),'existing-user','salt','bb'.repeat(32),1,1,1);
  db.prepare('INSERT INTO shares(token_hash,source_ciphertext,model_extension,model_identity,workspace_json,owner_ref,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run('cc'.repeat(32),'encrypted-legacy-source','3mf','dd'.repeat(32),'{}','legacy-owner',1,1000);
  db.prepare('INSERT INTO share_revisions VALUES(?,?,?,?,?,?,?)').run('cc'.repeat(32),1,'{}',2,'Old revision',1,'old-save');
  db.exec("UPDATE box_connection SET credentials='historical-encrypted-data'");
  const names=['shares','share_users','share_revisions','share_environment','box_connection'];
  const before=names.map(name=>JSON.stringify(db.prepare('SELECT * FROM '+name).all()));
  db.exec(readFileSync(new URL('../migrations/0006_dropbox_connection.sql',import.meta.url),'utf8'));
  names.forEach((name,i)=>assert.equal(JSON.stringify(db.prepare('SELECT * FROM '+name).all()),before[i]));
  assert.equal((db.prepare('SELECT version FROM share_schema_version').get() as any).version,6);
 }finally{db.close();}
});

test('callback diagnostics identify provider rejection without exposing response bodies or credentials',async()=>{
 const cases=[
  {path:'/oauth2/token',status:400,body:{error:'invalid_client',error_description:'SECRET client credentials'},stage:'token-exchange',reason:'DROPBOX_CLIENT_REJECTED'},
  {path:'/oauth2/token',status:400,body:{error:'invalid_grant',error_description:'SECRET authorization code'},stage:'token-exchange',reason:'DROPBOX_GRANT_REJECTED'},
  {path:'/users/get_current_account',status:401,body:{error_summary:'SECRET source URL',error:{'.tag':'expired_access_token'}},stage:'account-check',reason:'DROPBOX_HTTP_401'},
  {path:'/files/list_folder',status:403,body:{error:{'.tag':'missing_scope'},required_scope:'SECRET'},stage:'folder-check',reason:'DROPBOX_SCOPE_REQUIRED'},
 ];
 for(const item of cases){const f=fixture();try {
  const pending=await f.start();f.failProvider(item.path,item.status,JSON.stringify(item.body));
  const response=await f.worker.fetch(f.callback(pending),f.env);
  const location=response.headers.get('Location')!;const params=new URL(location,origin).searchParams;
  assert.equal(response.status,303);assert.equal(params.get('stage'),item.stage);assert.equal(params.get('reason'),item.reason);assert(!location.includes('SECRET'));assert(!location.includes('synthetic-client-secret'));assert(!location.includes('synthetic-code'));
  assert.equal((f.db.prepare('SELECT status FROM dropbox_connection').get() as any).status,'reconnect');
 }finally{f.db.close();}}
});

test('an omitted OAuth scope is accepted when unchanged, but an explicitly reduced scope still fails',async()=>{
 const f=fixture();try {f.omitTokenScope();await f.connect();assert.equal(await dropboxAccessToken(f.env,f.upstream,f.now),'test-access-secret');}
 finally{f.db.close();}
 const reduced=fixture();try {reduced.denyUpload();const pending=await reduced.start();const response=await reduced.worker.fetch(reduced.callback(pending),reduced.env);
 assert.equal(new URL(response.headers.get('Location')!,origin).searchParams.get('reason'),'DROPBOX_SCOPE_REQUIRED');
 }finally{reduced.db.close();}
});
