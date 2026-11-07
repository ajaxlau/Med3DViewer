import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createShareWorker, type ShareEnvironment, type D1Statement } from '../worker/index';
import { boxAccessToken, maintainBoxConnection } from '../worker/boxConnection';
const origin = 'https://ntec3dpo-m3dv-box-test.x-panda.workers.dev';
const admin = 'synthetic-admin-'.repeat(4), folder = '435218173835';
const token = (suffix = '') => ({ access_token: 'test-access-secret' + suffix, refresh_token: 'test-refresh-secret' + suffix, expires_in: 3600 });
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001_shares','0002_editable_workspaces','0003_public_workspace_history','0004_box_test_scope','0005_box_connection']) db.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url),'utf8'));
  db.exec("INSERT INTO share_environment(scope) VALUES('box-test')");
  const adapter = { prepare(sql: string): D1Statement { let values: any[] = []; return {
    bind(...args: any[]) { values = args; return this; },
    async first<T>() { return (db.prepare(sql).get(...values) || null) as T | null; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
  }; }, async batch(statements: D1Statement[]) { const result = []; db.exec('BEGIN'); try { for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } } };
  const env: ShareEnvironment = { SHARES_DB: adapter, SHARES_ENABLED: 'true', SHARES_ENVIRONMENT: 'box-test', SHARES_CREATE_KEY: admin, SHARES_ENCRYPTION_KEY: 'b'.repeat(64), BOX_ENABLED: 'true', BOX_ORIGIN: origin, BOX_UPLOAD_FOLDER_ID: folder, BOX_CLIENT_ID: 'synthetic-client-id', BOX_CLIENT_SECRET: 'synthetic-client-secret', BOX_CREDENTIALS_KEY: 'c'.repeat(64) };
  let clock = Date.UTC(2026,10,7), calls = 0, account = '12345', upload = true;
  const upstream = async (input: any, init: RequestInit) => {
    calls++;
    const url = String(input); assert.equal(init.redirect, 'error');
    if (url.endsWith('/oauth2/token')) {
      assert.equal(init.method, 'POST');
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get('client_secret'), env.BOX_CLIENT_SECRET);
      return new Response(JSON.stringify(token(body.get('grant_type') === 'refresh_token' ? '-rotated' : '')));
    }
    assert.equal((init.headers as any).Authorization?.startsWith('Bearer test-access-secret'), true);
    if (url.includes('/users/me')) return new Response(JSON.stringify({ id: account, name: 'Synthetic test account' }));
    assert.equal(url, `https://api.box.com/2.0/folders/${folder}?fields=id,name,permissions`);
    return new Response(JSON.stringify({ id: folder, name: 'Test folder', permissions: { can_upload: upload, can_download: true } }));
  };
  const worker = createShareWorker({ now: () => clock, fetch: upstream as typeof fetch });
  const request = (path: string, method = 'GET', auth = true, cookie = '', requestOrigin = origin) => new Request(origin + path, { method, headers: { ...(auth ? { Authorization: `Bearer ${admin}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { Origin: requestOrigin } : {}) } });
  async function start() {
    const r = await worker.fetch(request('/api/shares/admin/box/connect','POST'), env);
    assert.equal(r.status,200,await r.clone().text());
    const url = new URL((await r.json() as any).authorizationUrl);
    assert.equal(url.origin,'https://account.box.com'); assert.equal(url.searchParams.get('redirect_uri'), origin + '/api/shares/box/callback');
    const cookie = r.headers.get('Set-Cookie')!;
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Lax/); assert.match(cookie,/Secure/);
    return { state: url.searchParams.get('state')!, cookie: cookie.split(';')[0] };
  }
  const callback = (s: {state:string;cookie:string}, extra = '&code=synthetic-code') => request('/api/shares/box/callback?state=' + s.state + extra,'GET',false,s.cookie);
  async function connect() { const s = await start(); const response = await worker.fetch(callback(s),env); assert.equal(response.headers.get('Location'),'/admin/shares?box=connected'); return s; }
  return { db,env,worker,request,start,callback,connect,upstream:upstream as typeof fetch,get calls(){return calls;},advance(ms:number){clock+=ms;},get now(){return clock;},setAccount(id:string){account=id;},denyUpload(){upload=false;} };
}
test('Box administrator endpoints reject anonymous and cross-origin requests before provider access',async()=>{
  const f=fixture();try {
    for(const path of ['/api/shares/admin/box','/api/shares/admin/box/connect','/api/shares/admin/box/check','/api/shares/admin/box/disconnect']) assert.equal((await f.worker.fetch(f.request(path,path.endsWith('/box')?'GET':'POST',false),f.env)).status,401);
    assert.equal((await f.worker.fetch(f.request('/api/shares/admin/box/connect','POST',true,'','https://evil.example'),f.env)).status,403);
    assert.equal(f.calls,0);
  }finally{f.db.close();}
});
test('Box setup requires distinct credentials, matching environment and migration before connecting',async()=>{
  const f=fixture();try {
    const status=async()=>await (await f.worker.fetch(f.request('/api/shares/admin/box'),f.env)).json() as any;
    f.env.BOX_CREDENTIALS_KEY=f.env.SHARES_ENCRYPTION_KEY;assert.equal((await status()).enabled,false);
    f.env.BOX_CREDENTIALS_KEY='c'.repeat(64);f.db.exec("UPDATE share_environment SET scope='beta'");assert.equal((await f.worker.fetch(f.request('/api/shares/admin/box'),f.env)).status,503);
    f.db.exec("UPDATE share_environment SET scope='box-test'; UPDATE share_schema_version SET version=4");assert.equal((await status()).enabled,false);
    assert.equal(f.calls,0);
  }finally{f.db.close();}
});
test('OAuth state is hashed, browser-bound, single use and credentials are encrypted and sanitized',async()=>{
  const f=fixture();try {
    const s=await f.start(), pending=JSON.stringify(f.db.prepare('SELECT * FROM box_oauth_states').get());
    assert(!pending.includes(s.state));assert(!pending.includes(s.cookie.split('=')[1]));
    assert.equal((await f.worker.fetch(f.callback({...s,cookie:''}),f.env)).status,400);assert.equal(f.calls,0);
    assert.equal((await f.worker.fetch(f.callback(s),f.env)).headers.get('Location'),'/admin/shares?box=connected');
    const stored=JSON.stringify(f.db.prepare('SELECT * FROM box_connection').get());
    assert(!stored.includes('test-access-secret'));assert(!stored.includes('test-refresh-secret'));assert(!stored.includes('synthetic-client-secret'));
    const status=await (await f.worker.fetch(f.request('/api/shares/admin/box'),f.env)).text();assert(!status.includes('credentials'));assert(!status.includes('secret'));
    assert.equal(await boxAccessToken(f.env,f.upstream,f.now),'test-access-secret');
    const count=f.calls;assert.equal((await f.worker.fetch(f.callback(s),f.env)).status,400);assert.equal(f.calls,count);
  }finally{f.db.close();}
});
test('expired, duplicate and stale authorization callbacks never call Box',async()=>{
  const f=fixture();try {
    const first=await f.start(), second=await f.start();
    assert.equal((await f.worker.fetch(f.callback(first),f.env)).status,400);
    assert.equal((await f.worker.fetch(f.callback(second,'&code=a&code=b'),f.env)).status,400);
    f.advance(600001);assert.equal((await f.worker.fetch(f.callback(second),f.env)).status,400);assert.equal(f.calls,0);
  }finally{f.db.close();}
});
test('denied authorization and missing folder permission yield safe failure redirects without secrets',async()=>{
  const f=fixture();try {
    let s=await f.start();let r=await f.worker.fetch(f.callback(s,'&error=access_denied&error_description=SECRET'),f.env);
    assert.equal(r.status,303);assert.equal(r.headers.get('Location'),'/admin/shares?box=failed');assert.equal(f.calls,0);
    s=await f.start();f.denyUpload();r=await f.worker.fetch(f.callback(s),f.env);assert.equal(r.headers.get('Location'),'/admin/shares?box=failed');
    assert.equal((f.db.prepare('SELECT credentials FROM box_connection').get() as any).credentials,null);
  }finally{f.db.close();}
});
test('disconnect invalidates pending callbacks and keeps the account pin for reconnection',async()=>{
  const f=fixture();try {
    await f.connect();const pending=await f.start();
    assert.equal((await f.worker.fetch(f.request('/api/shares/admin/box/disconnect','POST'),f.env)).status,200);
    const count=f.calls;assert.equal((await f.worker.fetch(f.callback(pending),f.env)).status,400);assert.equal(f.calls,count);
    assert.equal((f.db.prepare('SELECT credentials FROM box_connection').get() as any).credentials,null);
    f.setAccount('98765');const s=await f.start();assert.equal((await f.worker.fetch(f.callback(s),f.env)).headers.get('Location'),'/admin/shares?box=failed');
    assert.equal((f.db.prepare('SELECT account_id FROM box_connection').get() as any).account_id,'12345');
  }finally{f.db.close();}
});
test('concurrent refresh has one provider call and persists only rotated encrypted credentials',async()=>{
  const f=fixture();try {
    await f.connect();f.advance(3600_000);const before=f.calls;
    const result=await Promise.allSettled([boxAccessToken(f.env,f.upstream,f.now),boxAccessToken(f.env,f.upstream,f.now)]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls-before,1);
    assert.equal(await boxAccessToken(f.env,f.upstream,f.now),'test-access-secret-rotated');
    assert(!JSON.stringify(f.db.prepare('SELECT * FROM box_connection').get()).includes('rotated'));
  }finally{f.db.close();}
});
test('failed or lost refresh responses require reconnection and are never retried automatically',async()=>{
  const f=fixture();try {
    await f.connect();f.advance(3600_000);let calls=0;
    const failing=async()=>{calls++;throw new Error('synthetic-secret-provider-error');};
    await assert.rejects(()=>boxAccessToken(f.env,failing as any,f.now),/Box could not/);
    await assert.rejects(()=>boxAccessToken(f.env,failing as any,f.now),/Connect the Box/);assert.equal(calls,1);
    assert.equal((f.db.prepare('SELECT status FROM box_connection').get() as any).status,'reconnect');
  }finally{f.db.close();}
});
test('scheduled upkeep rotates an idle connection before Box refresh-token expiry',async()=>{
  const f=fixture();try {
    await f.connect();f.advance(11*86400_000);const before=f.calls;
    await maintainBoxConnection(f.env,f.upstream,f.now);assert.equal(f.calls-before,1);
    assert.equal((f.db.prepare('SELECT status FROM box_connection').get() as any).status,'connected');
    assert((f.db.prepare('SELECT refresh_due_at FROM box_connection').get() as any).refresh_due_at>f.now);
  }finally{f.db.close();}
});
test('a crashed refresh lock is never taken over with the previously used token',async()=>{
  const f=fixture();try {
    await f.connect();f.db.prepare("UPDATE box_connection SET status='refreshing',lock_id='lost',lock_at=?").run(f.now-61000);
    const count=f.calls;await assert.rejects(()=>boxAccessToken(f.env,f.upstream,f.now),/refreshing/);assert.equal(f.calls,count);
    assert.equal((f.db.prepare('SELECT status FROM box_connection').get() as any).status,'reconnect');
  }finally{f.db.close();}
});
test('credential-key changes and folder changes stop access rather than using mismatched credentials',async()=>{
  const f=fixture();try {
    await f.connect();const count=f.calls;f.env.BOX_UPLOAD_FOLDER_ID='999';await assert.rejects(()=>boxAccessToken(f.env,f.upstream,f.now),/folder/);
    f.env.BOX_UPLOAD_FOLDER_ID=folder;f.env.BOX_CREDENTIALS_KEY='d'.repeat(64);await assert.rejects(()=>boxAccessToken(f.env,f.upstream,f.now),/credential configuration/);assert.equal(f.calls,count);
  }finally{f.db.close();}
});
