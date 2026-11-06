import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import cleanupWorker, { cleanupExpiredShares } from '../worker/cleanup';
import { createShareWorker, hashToken, SHARE_LIFETIME_MS, validateSource, type ShareEnvironment, type D1Statement } from '../worker/index';

class TestDatabase {
  db = new DatabaseSync(':memory:');
  constructor(editable = true) {
    this.db.exec(readFileSync(new URL('../migrations/0001_shares.sql', import.meta.url), 'utf8'));
    if (editable) this.db.exec(readFileSync(new URL('../migrations/0002_editable_workspaces.sql', import.meta.url), 'utf8'));
    this.db.exec("INSERT INTO share_environment(scope) VALUES('test')");
  }
  prepare(sql: string): D1Statement {
    const database = this.db;
    let values: any[] = [];
    return {
      bind(...input: any[]) { values = input; return this; },
      async first<T>() { return (database.prepare(sql).get(...values) || null) as T | null; },
      async run() { return { meta: { changes: Number(database.prepare(sql).run(...values).changes) } }; },
    };
  }
  async batch(statements: D1Statement[]) {
    this.db.exec('BEGIN');
    try { const result = []; for (const statement of statements) result.push(await statement.run()); this.db.exec('COMMIT'); return result; }
    catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
const identityMatrix = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function workspace() {
  return { schemaVersion:1, modelMatrix:identityMatrix,coordinateSystem:{ systemType:'Viewer world with recorded model root',units:'millimeters (mm)' },objects:[],groups:[] };
}
const creatorKey = 'test-only-creator-key-'.repeat(3);
function environment(): ShareEnvironment & { SHARES_DB: TestDatabase } {
  return { SHARES_DB:new TestDatabase(),SHARES_ENABLED:'true',SHARES_ENVIRONMENT:'test',SHARES_CREATE_KEY:creatorKey,SHARES_ENCRYPTION_KEY:'ab'.repeat(32) };
}
function createRequest(data: unknown = {}) {
  return new Request('https://viewer.example.com/api/shares',{ method:'POST',headers:{ 'Content-Type':'application/json',Authorization:`Bearer ${creatorKey}` },body:JSON.stringify({
    sourceUrl:'https://www.dropbox.com/scl/fi/synthetic-id/model.stl?rlkey=synthetic-access&dl=0',workspace:workspace(),modelIdentity:'ca'.repeat(32),...data as any,
  }) });
}
async function create(worker: ReturnType<typeof createShareWorker>,env: ShareEnvironment, data?: any) {
  const response = await worker.fetch(createRequest(data),env);
  assert.equal(response.status,201,await response.clone().text());
  return await response.json() as any;
}

test('D1 stores encrypted source and hashed token only; recipient JSON is sanitized', async () => {
  const env=environment();
  const now=Date.UTC(2026,10,4);
  const worker=createShareWorker({ now:()=>now });
  const share=await create(worker,env);
  assert.match(share.token,/^[a-f0-9]{64}$/);
  assert.equal(share.expiresAt,new Date(now+SHARE_LIFETIME_MS).toISOString());
  const stored=env.SHARES_DB.db.prepare('SELECT * FROM shares').get() as any;
  assert.equal(stored.token_hash,await hashToken(share.token));
  assert.notEqual(stored.token_hash,share.token);
  assert(!JSON.stringify(stored).includes('dropbox'));
  assert(!JSON.stringify(stored).includes('synthetic-access'));
  assert.equal(stored.workspace_json,JSON.stringify(workspace()));
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`),env);
  const metadata=await response.json() as any;
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store, max-age=0');
  assert.equal(metadata.modelUrl,`/api/shares/${share.token}/model.stl`);
  assert.deepEqual(metadata.workspace,workspace());
  assert(!JSON.stringify(metadata).includes('source'));
  assert(!JSON.stringify(metadata).includes('synthetic-access'));
  env.SHARES_DB.db.close();
});

test('sharing fails closed for disabled, absent/mismatched database scope and unauthorized creation',async()=>{
  const env=environment(),worker=createShareWorker();
  const config=()=>worker.fetch(new Request('https://viewer.example.com/api/shares/config'),env);
  assert.deepEqual(await (await config()).json(),{ enabled:true,editingEnabled:true,formats:['stl','3mf','glb'] });
  const denied=await worker.fetch(new Request(createRequest(),{ headers:{ 'Content-Type':'application/json' } }),env);
  assert.equal(denied.status,401);
  env.SHARES_ENVIRONMENT='main';
  assert.deepEqual(await (await config()).json(),{ enabled:false });
  assert.equal((await worker.fetch(createRequest(),env)).status,503);
  env.SHARES_ENVIRONMENT='test';
  env.SHARES_DB.db.exec('DELETE FROM share_environment');
  assert.deepEqual(await (await config()).json(),{ enabled:false });
  env.SHARES_ENABLED='false';
  assert.equal((await worker.fetch(createRequest(),env)).status,503);
  env.SHARES_DB.db.close();
});

test('source policy blocks SSRF targets, credentials, arbitrary hosts, wrong formats and embedded model data',async()=>{
  const env=environment(),worker=createShareWorker();
  for(const sourceUrl of [
    'http://dl.dropboxusercontent.com/model.stl','https://127.0.0.1/model.stl','https://[::1]/model.stl',
    'https://user:pass@dl.dropboxusercontent.com/model.stl','https://dl.dropboxusercontent.com:444/model.stl',
    'https://unapproved.example.net/model.stl','https://dl.dropboxusercontent.com/model.obj',
  ]) assert.equal((await worker.fetch(createRequest({ sourceUrl }),env)).status,400);
  assert.equal((await worker.fetch(createRequest({ workspace:{ ...workspace(),fileDataURL:'data:application/octet-stream;base64,AAAA' } }),env)).status,400);
  assert.equal((await worker.fetch(createRequest({ workspace:{ ...workspace(),objects:[{ id:'one',name:'x',type:'custom_model',meshMatrix:identityMatrix,fileDataURL:'data:application/octet-stream;base64,AAAA' }] } }),env)).status,400);
  assert.equal((await worker.fetch(createRequest({ modelIdentity:'not-a-fingerprint' }),env)).status,400);
  assert.equal((await worker.fetch(new Request(createRequest(),{ headers:{ Origin:'https://attacker.example',Authorization:`Bearer ${creatorKey}`,'Content-Type':'application/json' } }),env)).status,403);
  assert.throws(()=>validateSource('https://dl.dropboxusercontent.com.evil.example/file.stl',env,'https://viewer.example.com'),/Dropbox/);
  env.SHARES_DB.db.close();
});

test('expiry applies to JSON, HEAD, Range and model requests without waiting for cleanup',async()=>{
  let now=1_800_000_000_000;
  const env=environment();
  let fetched=0;
  const worker=createShareWorker({ now:()=>now,fetch:async()=>{ fetched++; return new Response('solid model\nendsolid model'); } });
  const share=await create(worker,env);
  now+=SHARE_LIFETIME_MS;
  for(const [suffix,method,headers] of [['','GET',{}],['','HEAD',{}],['/model.stl','GET',{}],['/model.stl','HEAD',{}],['/model.stl','GET',{ Range:'bytes=0-99' }]] as const) {
    const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}${suffix}`,{ method,headers }),env);
    assert.equal(response.status,404);
  }
  assert.equal(fetched,0);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,1);
  await worker.scheduled(null,env);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,0);
  env.SHARES_DB.db.close();
});

test('owner revocation is immediate and creator/storage quotas are transactional',async()=>{
  const env=environment(),worker=createShareWorker({ now:()=>1_800_000_000_000 });
  env.SHARES_DAILY_CREATE_LIMIT='1';
  const share=await create(worker,env);
  assert.equal((await worker.fetch(createRequest(),env)).status,429);
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`,{ method:'DELETE',headers:{ Authorization:`Bearer ${creatorKey}` } }),env)).status,204);
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`),env)).status,404);
  await worker.scheduled(null,env);
  assert.equal((await worker.fetch(createRequest(),env)).status,429,'cleanup cannot reset daily quota');
  env.SHARES_DB.db.close();
});

test('model stream strips source headers/cookies and only forwards an approved bounded range',async()=>{
  const env=environment();
  let observed: any;
  const worker=createShareWorker({ fetch:async(input,init)=>{
    observed={ input,init };
    return new Response('solid test\nendsolid test',{ status:206,headers:{ 'Content-Type':'application/octet-stream','Content-Range':'bytes 0-24/25','Set-Cookie':'secret=source','X-Source':'private','Content-Disposition':'inline; filename="private-patient.stl"' } });
  } });
  const share=await create(worker,env);
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`,{ headers:{ Range:'bytes=0-24',Cookie:'visitor-cookie',Authorization:'visitor-key' } }),env);
  assert.equal(response.status,206);
  assert.equal(await response.text(),'solid test\nendsolid test');
  assert.equal(response.headers.get('Set-Cookie'),null);
  assert.equal(response.headers.get('X-Source'),null);
  assert.equal(response.headers.get('Content-Disposition'),'inline; filename="model.stl"');
  assert.equal(new Headers(observed.init.headers).get('Cookie'),null);
  assert.equal(new Headers(observed.init.headers).get('Authorization'),null);
  assert.equal(new Headers(observed.init.headers).get('Range'),'bytes=0-24');
  assert.equal(observed.init.redirect,'manual');
  assert.equal(observed.init.cache,'no-store');
  assert(observed.input.includes('dl.dropboxusercontent.com'));
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`,{ headers:{ Range:'bytes=0-2,4-5' } }),env)).status,416);
  env.SHARES_DB.db.close();
});

test('redirect to an unapproved source and upstream HTML fail without echoing private URLs',async()=>{
  const env=environment();
  let calls=0;
  const worker=createShareWorker({ fetch:async()=>{ calls++; return new Response(null,{ status:302,headers:{ Location:'https://attacker.example/model.stl?private=upstream-secret' } }); } });
  const share=await create(worker,env);
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  assert.equal(response.status,502);
  assert.equal(calls,1);
  const error=await response.json() as any;
  assert.equal(error.error.code,'SOURCE_REDIRECT_UNSUPPORTED');
  assert(!JSON.stringify(error).includes('upstream-secret'));
  const html=createShareWorker({ fetch:async()=>new Response('<html>private</html>',{ headers:{ 'Content-Type':'text/html' } }) });
  const rejected=await html.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  assert.equal(rejected.status,502);
  assert(!(await rejected.text()).includes('<html>'));
  env.SHARES_DB.db.close();
});

test('Dropbox documented download redirects preserve access parameters and strip upstream response details',async()=>{
  const env=environment();
  const destinations=[
    'https://www.dropbox.com/s/dl/synthetic/model.stl?rlkey=synthetic-access',
    '/s/raw/synthetic/model.stl?rlkey=synthetic-access',
    'https://cdn.dl.dropboxusercontent.com/synthetic/model.stl?download=synthetic-access',
  ];
  const visited:string[]=[];
  let cancelled=0;
  const worker=createShareWorker({ fetch:async(input,init)=>{
    visited.push(String(input));
    assert.equal(init?.redirect,'manual');
    assert.equal(new Headers(init?.headers).get('Cookie'),null);
    const location=destinations[visited.length-1];
    if(location) return new Response(new ReadableStream({ cancel(){ cancelled++; } }),{ status:302,headers:{ Location:location } });
    return new Response('solid synthetic\nendsolid synthetic',{ headers:{ 'Content-Type':'application/octet-stream','Set-Cookie':'private=source' } });
  } });
  const share=await create(worker,env);
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  assert.equal(response.status,200);
  assert.equal(await response.text(),'solid synthetic\nendsolid synthetic');
  assert.deepEqual(visited,[
    'https://dl.dropboxusercontent.com/scl/fi/synthetic-id/model.stl?rlkey=synthetic-access',
    destinations[0],`https://www.dropbox.com${destinations[1]}`,destinations[2],
  ]);
  assert.equal(cancelled,3);
  assert.equal(response.headers.get('Set-Cookie'),null);
  assert.equal(response.headers.get('Location'),null);
  env.SHARES_DB.db.close();
});

test('download redirects reject lookalikes, login routes, credentials, ports and private destinations before fetching',async()=>{
  const env=environment();
  const share=await create(createShareWorker(),env);
  for(const location of [
    'https://www.dropbox.com/login?next=private',
    'https://www.dropbox.com/s/dl.evil/model.stl',
    'https://www.dropbox.com.evil.example/s/dl/model.stl',
    'https://dl.dropboxusercontent.com.evil.example/model.stl',
    'https://user:secret@www.dropbox.com/s/dl/model.stl',
    'https://www.dropbox.com:444/s/dl/model.stl',
    'http://www.dropbox.com/s/dl/model.stl',
    'https://127.0.0.1/s/dl/model.stl',
    'https://[::1]/s/raw/model.stl',
  ]) {
    let calls=0;
    const worker=createShareWorker({ fetch:async()=>{ calls++; return new Response(null,{ status:302,headers:{ Location:location } }); } });
    const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
    assert.equal(response.status,502);
    const error=await response.json() as any;
    assert.equal(error.error.code,'SOURCE_REDIRECT_UNSUPPORTED');
    assert(!JSON.stringify(error).includes(location));
    assert.equal(calls,1);
  }
  env.SHARES_DB.db.close();
});

test('Dropbox HTTP failures and transport errors return safe, distinct diagnostic codes',async()=>{
  const env=environment();
  const share=await create(createShareWorker(),env);
  for(const [status,code] of [[401,'SOURCE_ACCESS_DENIED'],[403,'SOURCE_ACCESS_DENIED'],[404,'SOURCE_NOT_FOUND'],[410,'SOURCE_NOT_FOUND'],[429,'SOURCE_RATE_LIMITED'],[500,'SOURCE_UNAVAILABLE']] as const) {
    let cancelled=false;
    const worker=createShareWorker({ fetch:async()=>new Response(new ReadableStream({ cancel(){ cancelled=true; } }),{ status,headers:{ 'X-Private':'synthetic-secret' } }) });
    const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
    assert.equal(response.status,502);
    const error=await response.json() as any;
    assert.equal(error.error.code,code);
    assert.equal(response.headers.get('X-Private'),null);
    assert.equal(cancelled,true);
  }
  const network=createShareWorker({ fetch:async()=>{ throw new Error('https://private.example/?access=synthetic-secret'); } });
  const response=await network.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  const error=await response.json() as any;
  assert.equal(error.error.code,'SOURCE_FETCH_FAILED');
  assert(!JSON.stringify(error).includes('synthetic-secret'));
  env.SHARES_DB.db.close();
});

test('changed encryption secret is distinguished from an unavailable Dropbox file without fetching',async()=>{
  const env=environment();
  let calls=0;
  const worker=createShareWorker({ fetch:async()=>{ calls++; return new Response('solid synthetic'); } });
  const share=await create(worker,env);
  env.SHARES_ENCRYPTION_KEY='different-test-only-random-secret-'.repeat(2);
  const config=await worker.fetch(new Request('https://viewer.example.com/api/shares/config'),env);
  assert.equal((await config.json() as any).enabled,true);
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  const error=await response.json() as any;
  assert.equal(response.status,502);
  assert.equal(error.error.code,'SOURCE_DECRYPTION_FAILED');
  assert.equal(calls,0);
  env.SHARES_DB.db.close();
});

test('upstream header timeout reports a safe timeout code',async t=>{
  t.mock.timers.enable({ apis:['setTimeout'] });
  const env=environment();
  let started:()=>void;
  const fetching=new Promise<void>(resolve=>{ started=resolve; });
  const worker=createShareWorker({ fetch:async(_input,init)=>new Promise<Response>((_resolve,reject)=>{
    init!.signal!.addEventListener('abort',()=>reject(new Error('private upstream details')),{ once:true });
    started();
  }) });
  const share=await create(worker,env);
  const pending=worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  await fetching;
  t.mock.timers.tick(180_000);
  const response=await pending;
  const error=await response.json() as any;
  assert.equal(response.status,504);
  assert.equal(error.error.code,'SOURCE_TIMEOUT');
  assert(!JSON.stringify(error).includes('private upstream details'));
  env.SHARES_DB.db.close();
});

test('runtimes without an incoming request signal still stream and cancel the upstream',async()=>{
  const env=environment();
  let signal:AbortSignal|undefined;
  const worker=createShareWorker({ fetch:async(_input,init)=>{
    signal=init?.signal as AbortSignal;
    return new Response(new ReadableStream({ pull(output){ output.enqueue(new Uint8Array([1])); } }));
  } });
  const share=await create(worker,env);
  const request=new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`);
  Object.defineProperty(request,'signal',{ value:undefined });
  const response=await worker.fetch(request,env);
  assert.equal(response.status,200);
  await response.body!.cancel();
  assert.equal(signal?.aborted,true);
  env.SHARES_DB.db.close();
});

test('unknown APIs do not fall through to SPA, and database failures never leak errors',async()=>{
  const env=environment(),worker=createShareWorker();
  env.ASSETS={ fetch:async()=>new Response('viewer asset') };
  assert.equal(await (await worker.fetch(new Request('https://viewer.example.com/'),env)).text(),'viewer asset');
  assert.equal((await worker.fetch(new Request('https://viewer.example.com/api/shares/unknown'),env)).status,404);
  env.SHARES_DB.db.close();
  const response=await worker.fetch(new Request('https://viewer.example.com/api/shares/config'),env);
  assert.deepEqual(await response.json(),{ enabled:false });
});

test('model cancellation aborts upstream fetch and size checks reject large declared bodies',async()=>{
  const env=environment();
  let signal: AbortSignal | undefined,upstreamCancelled=false;
  const worker=createShareWorker({ fetch:async(_input,init)=>{
    signal=init?.signal as AbortSignal;
    return new Response(new ReadableStream({
      pull(output){ output.enqueue(new TextEncoder().encode('solid test\n')); },
      cancel(){ upstreamCancelled=true; },
    }));
  } });
  const share=await create(worker,env);
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  await response.body!.cancel();
  assert.equal(signal?.aborted,true);
  assert.equal(upstreamCancelled,true);
  const large=createShareWorker({ fetch:async()=>new Response(null,{ headers:{ 'Content-Length':String(151*1024*1024) } }) });
  const rejected=await large.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  assert.equal(rejected.status,413);
  assert(!(await rejected.text()).includes('synthetic-access'));
  env.SHARES_DB.db.close();
});

test('read burst is limited and a wrong environment cannot clean up another database',async()=>{
  const env=environment(),worker=createShareWorker({ now:()=>1_800_000_000_000 });
  const share=await create(worker,env);
  const request=new Request(`https://viewer.example.com/api/shares/${share.token}`);
  for(let i=0;i<120;i++) assert.equal((await worker.fetch(request,env)).status,200);
  assert.equal((await worker.fetch(request,env)).status,429);
  env.SHARES_DB.db.prepare('UPDATE shares SET expires_at=0').run();
  env.SHARES_ENVIRONMENT='main';
  await worker.scheduled(null,env);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,1);
  env.SHARES_ENVIRONMENT='test';
  await worker.scheduled(null,env);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,0);
  env.SHARES_DB.db.close();
});

test('bounded JSON reads reject oversized declarations and unknown fields before persistence',async()=>{
  const env=environment(),worker=createShareWorker();
  const oversized=new Request(createRequest(),{ headers:{ Authorization:`Bearer ${creatorKey}`,'Content-Type':'application/json','Content-Length':String(300*1024) } });
  assert.equal((await worker.fetch(oversized,env)).status,413);
  assert.equal((await worker.fetch(createRequest({ unexpected:'https://private.example/' }),env)).status,400);
  env.SHARES_MAX_RECORDS='1';
  await create(worker,env);
  assert.equal((await worker.fetch(createRequest(),env)).status,429);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,1);
  env.SHARES_DB.db.close();
});


test('standalone scheduled cleanup needs no creator/encryption secret and enforces scope',async()=>{
  const env=environment(),worker=createShareWorker({ now:()=>1_800_000_000_000 });
  await create(worker,env);
  env.SHARES_DB.db.prepare('UPDATE shares SET expires_at=0').run();
  const cleanupEnv={ SHARES_DB:env.SHARES_DB,SHARES_ENVIRONMENT:'main' };
  await cleanupExpiredShares(cleanupEnv,1_800_000_000_000);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,1);
  cleanupEnv.SHARES_ENVIRONMENT='test';
  assert.equal(cleanupWorker.fetch().status,404);
  await cleanupWorker.scheduled(null,cleanupEnv);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,0);
  env.SHARES_DB.db.close();
});


test('source encryption accepts random long secrets and legacy hex keys but rejects short config',async()=>{
  const env=environment();
  env.SHARES_ENCRYPTION_KEY='test-only-random-key-mode-'.repeat(3);
  const worker=createShareWorker({ fetch:async()=>new Response('solid test\nendsolid test') });
  const share=await create(worker,env);
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  assert.equal(response.status,200);
  assert.equal(await response.text(),'solid test\nendsolid test');
  env.SHARES_ENCRYPTION_KEY='short-unsafe-key';
  const config=await worker.fetch(new Request('https://viewer.example.com/api/shares/config'),env);
  assert.deepEqual(await config.json(),{ enabled:false });
  env.SHARES_DB.db.close();
});

test('streamed byte ceiling applies when the upstream omits Content-Length',async()=>{
  const env=environment();
  const chunk=new Uint8Array(1024*1024);
  let produced=0,cancelled=false;
  const worker=createShareWorker({ fetch:async()=>new Response(new ReadableStream({
    pull(output){ produced++; output.enqueue(chunk); },
    cancel(){ cancelled=true; },
  })) });
  const share=await create(worker,env);
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);
  const reader=response.body!.getReader();
  let received=0;
  await assert.rejects(async()=>{
    while(true){ const item=await reader.read(); if(item.done) break; received+=item.value.byteLength; }
  },/interrupted/);
  assert.equal(received,150*1024*1024);
  assert.equal(cancelled,true);
  assert(produced<155,'backpressure must not eagerly consume the source');
  env.SHARES_DB.db.close();
});


test('rotating the staff creator key preserves authority to revoke existing shares',async()=>{
  const env=environment(),worker=createShareWorker();
  const share=await create(worker,env);
  const oldKey=env.SHARES_CREATE_KEY!;
  env.SHARES_CREATE_KEY='rotated-test-only-random-access-key-'.repeat(2);
  const path=`https://viewer.example.com/api/shares/${share.token}`;
  assert.equal((await worker.fetch(new Request(path,{ method:'DELETE',headers:{ Authorization:`Bearer ${oldKey}` } }),env)).status,401);
  assert.equal((await worker.fetch(new Request(path,{ method:'DELETE',headers:{ Authorization:`Bearer ${env.SHARES_CREATE_KEY}` } }),env)).status,204);
  assert.equal((await worker.fetch(new Request(path),env)).status,404);
  env.SHARES_DB.db.close();
});


test('malformed restored expiry and fingerprint fields fail closed before metadata or model access',async()=>{
  const env=environment(),worker=createShareWorker();
  const share=await create(worker,env);
  env.SHARES_DB.db.prepare('UPDATE shares SET expires_at=?').run('not-an-expiry');
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`),env)).status,404);
  env.SHARES_DB.db.prepare('UPDATE shares SET expires_at=created_at+?,model_identity=?').run(SHARE_LIFETIME_MS,'zz'.repeat(32));
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env)).status,404);
  env.SHARES_DB.db.close();
});


test('unknown valid-shaped tokens do not write persistent rate-limit rows',async()=>{
  const env=environment(),worker=createShareWorker();
  for(let i=0;i<8;i++) {
    const token=i.toString(16).padStart(64,'0');
    for(const suffix of ['', '/model.stl']) {
      assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${token}${suffix}`),env)).status,404);
    }
  }
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM share_rate_limits').get() as any).n,0);
  assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM shares').get() as any).n,0);
  env.SHARES_DB.db.close();
});

test('malformed paths/methods and hostile origins are rejected before any database access',async()=>{
  const env=environment(),worker=createShareWorker();
  let reads=0;
  const original=env.SHARES_DB.prepare.bind(env.SHARES_DB);
  env.SHARES_DB.prepare=(sql:string)=>{ reads++; return original(sql); };
  const token='ab'.repeat(32);
  for(const [path,options,status] of [
    ['/api/shares/not-a-token',{},404],
    [`/api/shares/${token}`,{ method:'PATCH' },405],
    [`/api/shares/${token}/model.stl`,{ method:'DELETE' },405],
    [`/api/shares/${token}?url=https://attacker.example`,{},400],
    ['/api/shares/config',{ headers:{ Origin:'https://attacker.example' } },403],
  ] as const) assert.equal((await worker.fetch(new Request(`https://viewer.example.com${path}`,options),env)).status,status);
  assert.equal(reads,0);
  env.SHARES_DB.db.close();
});

const ownerHeaders={Authorization:`Bearer ${creatorKey}`};
async function editLink(worker:ReturnType<typeof createShareWorker>,env:ShareEnvironment,token:string) {
  const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${token}/edit-link`,{method:'POST',headers:ownerHeaders}),env);
  assert.equal(response.status,200,await response.clone().text());
  const data=await response.json() as any;
  return {url:data.url,token:new URL(data.url).pathname.split('/').at(-1)!};
}
function saveRequest(token:string,revision=1,changes:any={}) {
  return new Request(`https://viewer.example.com/api/shares/${token}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace:workspace(),modelIdentity:'ca'.repeat(32),revision,...changes})});
}
test('STL, 3MF and GLB retain format-specific protected streams without model copies',async()=>{
  const env=environment();
  const worker=createShareWorker({fetch:async()=>new Response(new Uint8Array([80,75,3,4,0,1]))});
  for(const [extension,mime] of [['stl','model/stl'],['3mf','model/3mf'],['glb','model/gltf-binary']]) {
    const share=await create(worker,env,{sourceUrl:`https://www.dropbox.com/scl/fi/synthetic/model.${extension}?rlkey=synthetic`});
    const response=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.${extension}`),env);
    assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),mime);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array([80,75,3,4,0,1]));
    assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.obj`),env)).status,404);
  }
  const columns=env.SHARES_DB.db.prepare('PRAGMA table_info(shares)').all().map((row:any)=>row.name);
  assert(!columns.some((name:string)=>/model_bytes|geometry|file_data/.test(name)));
  env.SHARES_DB.db.close();
});
test('only creator-password authorization can reveal an edit link; view metadata cannot reveal it',async()=>{
  const env=environment(),worker=createShareWorker();const share=await create(worker,env);
  const path=`https://viewer.example.com/api/shares/${share.token}/edit-link`;
  assert.equal((await worker.fetch(new Request(path,{method:'POST'}),env)).status,401);
  assert.equal((await worker.fetch(new Request(path,{method:'POST',headers:{Authorization:'Bearer wrong-password'}}),env)).status,401);
  const edit=await editLink(worker,env,share.token);
  assert.notEqual(edit.token,share.token);
  assert.equal((await editLink(worker,env,share.token)).url,edit.url,'retrieving an edit link must not revoke collaborators');
  const view=await (await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`),env)).json() as any;
  assert.equal(view.role,'view');assert.equal(view.revision,1);assert(!JSON.stringify(view).includes(edit.token));
  const editable=await (await worker.fetch(new Request(`https://viewer.example.com/api/shares/${edit.token}`),env)).json() as any;
  assert.equal(editable.role,'edit');assert.equal(editable.viewUrl,share.url);
  const stored=env.SHARES_DB.db.prepare('SELECT * FROM shares').get() as any;
  assert.equal(stored.edit_token_hash,await hashToken(edit.token));
  assert(!JSON.stringify(stored).includes(edit.token));assert(!JSON.stringify(stored).includes(share.token));
  env.SHARES_DB.db.close();
});
test('view links cannot write and edit links atomically save planning plus multi-mesh visibility',async()=>{
  const env=environment(),worker=createShareWorker();const share=await create(worker,env);const edit=await editLink(worker,env,share.token);
  assert.equal((await worker.fetch(saveRequest(share.token),env)).status,403);
  const snapshot={...workspace(),schemaVersion:2,meshes:[{key:'0',vertices:3,indices:3,visible:false,opacity:0},{key:'1',vertices:3,indices:3,visible:true,opacity:0.5}]};
  const response=await worker.fetch(saveRequest(edit.token,1,{workspace:snapshot}),env);
  assert.equal(response.status,200);assert.equal((await response.json() as any).revision,2);
  const view=await (await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`),env)).json() as any;
  assert.deepEqual(view.workspace,snapshot);assert.equal(view.revision,2);
  assert.equal((await worker.fetch(saveRequest(edit.token,1,{workspace:snapshot}),env)).status,409);
  assert.equal((await worker.fetch(saveRequest(edit.token,2,{sourceUrl:'https://attacker.example/model.stl'}),env)).status,400);
  assert.equal((await worker.fetch(saveRequest(edit.token,2,{modelIdentity:'ab'.repeat(32)}),env)).status,409);
  assert.equal((env.SHARES_DB.db.prepare('SELECT revision FROM shares').get() as any).revision,2);
  env.SHARES_DB.db.close();
});
test('concurrent editor saves cannot silently overwrite each other',async()=>{
  const env=environment(),worker=createShareWorker();const share=await create(worker,env);const edit=await editLink(worker,env,share.token);
  const responses=await Promise.all([worker.fetch(saveRequest(edit.token,1),env),worker.fetch(saveRequest(edit.token,1),env)]);
  assert.deepEqual(responses.map(value=>value.status).sort(),[200,409]);
  assert.equal((env.SHARES_DB.db.prepare('SELECT revision FROM shares').get() as any).revision,2);
  env.SHARES_DB.db.close();
});
test('admin listing is password-protected, paginated and excludes sources, edit tokens and geometry',async()=>{
  const env=environment(),worker=createShareWorker({now:()=>1_800_000_000_000});
  let editToken='';for(let i=0;i<26;i++){const share=await create(worker,env,{label:`Workspace ${i}`});if(i===0)editToken=(await editLink(worker,env,share.token)).token;}
  const path='https://viewer.example.com/api/shares/admin';
  assert.equal((await worker.fetch(new Request(path),env)).status,401);
  const first=await (await worker.fetch(new Request(path,{headers:ownerHeaders}),env)).json() as any;
  assert.equal(first.items.length,25);assert(first.nextCursor);
  assert(!JSON.stringify(first).includes('dropbox'));assert(!JSON.stringify(first).includes('source_ciphertext'));assert(!JSON.stringify(first).includes(editToken));
  assert(first.items.every((item:any)=>/^https:\/\/viewer.example.com\/s\/[a-f0-9]{64}$/.test(item.viewUrl)));
  const second=await (await worker.fetch(new Request(`${path}?before=${first.nextCursor}`,{headers:ownerHeaders}),env)).json() as any;
  assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);
  assert(!first.items.some((a:any)=>a.id===second.items[0].id));
  assert.equal((await worker.fetch(new Request(`${path}?before=invalid`,{headers:ownerHeaders}),env)).status,400);
  assert.equal((await worker.fetch(new Request(`${path}?url=https://attacker.example`,{headers:ownerHeaders}),env)).status,400);
  env.SHARES_DB.db.close();
});
test('admin expiry edits stay within creation plus 180 days and invalidate stale editor revisions',async()=>{
  let now=1_800_000_000_000;const env=environment(),worker=createShareWorker({now:()=>now});
  const share=await create(worker,env),edit=await editLink(worker,env,share.token),id=await hashToken(share.token);now+=86_400_000;
  const patch=(body:any)=>new Request(`https://viewer.example.com/api/shares/admin/${id}`,{method:'PATCH',headers:{...ownerHeaders,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await worker.fetch(patch({revision:1,expiresAt:new Date(now+SHARE_LIFETIME_MS).toISOString()}),env)).status,400);
  assert.equal((await worker.fetch(patch({revision:1,expiresAt:new Date(now-1).toISOString()}),env)).status,400);
  const expiry=now+86_400_000;
  const updated=await worker.fetch(patch({revision:1,label:'Reviewed workspace',expiresAt:new Date(expiry).toISOString()}),env);
  assert.equal(updated.status,200);
  assert.equal((await worker.fetch(saveRequest(edit.token,1),env)).status,409);
  assert.equal((await worker.fetch(saveRequest(edit.token,2),env)).status,200);
  const metadata=await (await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`),env)).json() as any;
  assert.equal(metadata.expiresAt,new Date(expiry).toISOString());
  now=expiry;
  assert.equal((await worker.fetch(saveRequest(edit.token,3),env)).status,404);
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${edit.token}/model.stl`),env)).status,404);
  env.SHARES_DB.db.close();
});
test('admin revocation disables view and edit capabilities immediately',async()=>{
  const env=environment(),worker=createShareWorker();const share=await create(worker,env),edit=await editLink(worker,env,share.token);
  const path=`https://viewer.example.com/api/shares/admin/${await hashToken(share.token)}`;
  assert.equal((await worker.fetch(new Request(path,{method:'DELETE'}),env)).status,401);
  assert.equal((await worker.fetch(new Request(path,{method:'DELETE',headers:ownerHeaders}),env)).status,204);
  for(const token of [share.token,edit.token])for(const suffix of ['','/model.stl'])assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${token}${suffix}`),env)).status,404);
  assert.equal((await worker.fetch(saveRequest(edit.token),env)).status,404);
  const issued=await worker.fetch(new Request(`${path}/edit-link`,{method:'POST',headers:ownerHeaders}),env);assert.equal(issued.status,404);
  env.SHARES_DB.db.close();
});
test('legacy databases keep viewing/creation working and enable editing only after the additive migration',async()=>{
  const env=environment();env.SHARES_DB.db.close();env.SHARES_DB=new TestDatabase(false);
  const worker=createShareWorker({fetch:async()=>new Response('solid synthetic\nendsolid synthetic')});
  const share=await create(worker,env);
  const config=await (await worker.fetch(new Request('https://viewer.example.com/api/shares/config'),env)).json() as any;
  assert.equal(config.enabled,true);assert.equal(config.editingEnabled,false);
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}`),env)).status,200);
  const model=await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/model.stl`),env);assert.equal(model.status,200);await model.body?.cancel();
  assert.equal((await worker.fetch(new Request(`https://viewer.example.com/api/shares/${share.token}/edit-link`,{method:'POST',headers:ownerHeaders}),env)).status,503);
  env.SHARES_DB.db.exec(readFileSync(new URL('../migrations/0002_editable_workspaces.sql',import.meta.url),'utf8'));
  const edit=await editLink(worker,env,share.token);
  assert.equal((await worker.fetch(saveRequest(edit.token,1),env)).status,200);
  const listing=await (await worker.fetch(new Request('https://viewer.example.com/api/shares/admin',{headers:ownerHeaders}),env)).json() as any;
  assert.equal(listing.items[0].viewUrl,share.url);
  env.SHARES_DB.db.close();
});
