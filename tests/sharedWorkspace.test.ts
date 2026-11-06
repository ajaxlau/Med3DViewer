import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginSharedModelImport, captureModelLoad, createProtectedShare, loadSharedModel, protectedModelPath, readBoundedBytes,
  sha256Hex, tokenFromSharePath, validateShareResponse, waitForSharedModelReady,
  requestEditWorkspaceLink, saveProtectedWorkspace,
} from '../src/lib/sharedWorkspace.ts';

const token = 'a'.repeat(64);
const origin = 'https://viewer.example';
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const workspace = {
  schemaVersion: 1,
  coordinateSystem: { systemType: 'Viewer world with recorded model root', units: 'millimeters (mm)' },
  modelMatrix: matrix, objects: [], groups: [],
};
const metadata = () => ({ workspace, modelIdentity: 'b'.repeat(64), modelUrl: `/api/shares/${token}/model.stl`, expiresAt: '2099-01-01T00:00:00.000Z' });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: new URL(origin) } });

test('protected route parser accepts only an opaque token without source data', () => {
  assert.equal(tokenFromSharePath(`/s/${token}`), token);
  assert.equal(tokenFromSharePath(`/s/${token}/`), token);
  for (const path of ['/s/short', `/s/${token}/model`, '/s/https://source.example/model.stl', `/s/${token}?url=secret`]) assert.equal(tokenFromSharePath(path), null);
});

test('protected model reference must stay on the same origin and token, without redirect parameters', () => {
  assert.equal(protectedModelPath(token, `/api/shares/${token}/model.stl`, origin), `${origin}/api/shares/${token}/model.stl`);
  for (const url of [
    'https://source.example/model.stl', `https://user:pass@viewer.example/api/shares/${token}/model.stl`,
    `/api/shares/${'b'.repeat(64)}/model.stl`, `/api/shares/${token}/model.stl?url=secret`,
    `/api/shares/${token}/model.stl#secret`, `/api/shares/${token}/model.obj`,
  ]) assert.throws(() => protectedModelPath(token, url, origin));
});

test('workspace response validates expiry and refuses embedded model data', () => {
  assert.deepEqual(validateShareResponse(metadata(), token, origin).workspace.objects, []);
  assert.throws(() => validateShareResponse({ ...metadata(), expiresAt: '2000-01-01' }, token, origin));
  assert.throws(() => validateShareResponse({ ...metadata(), expiresAt: 'invalid' }, token, origin));
  assert.throws(() => validateShareResponse({ ...metadata(), workspace: { ...workspace, fileDataURL: 'data:model' } }, token, origin));
});

test('stream limits cancel declared and undeclared oversized model bodies', async () => {
  let cancelled = false;
  const declared = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': '100' } });
  await assert.rejects(readBoundedBytes(declared, 10), /device/);
  assert.equal(cancelled, true);
  cancelled = false;
  const streamed = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } }));
  await assert.rejects(readBoundedBytes(streamed, 10), /device/);
  assert.equal(cancelled, true);
});

test('an observer error cancels the upstream stream', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2)); }, cancel() { cancelled = true; } }));
  await assert.rejects(readBoundedBytes(response, 10, undefined, () => { throw new Error('observer failed'); }), /observer/);
  assert.equal(cancelled, true);
});

test('shared model is fetched once, verified before import, and contains no source reference', async t => {
  const body = new TextEncoder().encode('synthetic-model').buffer as ArrayBuffer;
  const identity = await sha256Hex(body);
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit) => {
    requests.push(String(url));
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    return requests.length === 1 ? new Response(JSON.stringify({ ...metadata(), modelIdentity: identity })) : new Response(body);
  });
  const result = await loadSharedModel(token, { signal: new AbortController().signal, capabilities: null, safeMode: true, origin });
  assert.equal(result.file.name, 'shared-model.stl');
  assert.equal(await result.file.text(), 'synthetic-model');
  assert.deepEqual(requests, [`${origin}/api/shares/${token}`, `${origin}/api/shares/${token}/model.stl`]);
  assert.equal(JSON.stringify(result.metadata).includes('sourceUrl'), false);
});

test('changed source bytes refuse workspace restoration', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => ++requests === 1 ? new Response(JSON.stringify(metadata())) : new Response('changed-model'));
  await assert.rejects(loadSharedModel(token, { signal: new AbortController().signal, capabilities: null, safeMode: true, origin }), /source model has changed/);
  assert.equal(requests, 2);
});

test('download errors show an allowlisted diagnostic without exposing server text', async t => {
  for(const code of ['SOURCE_ACCESS_DENIED','SOURCE_NOT_FOUND','SOURCE_RATE_LIMITED','SOURCE_REDIRECT_UNSUPPORTED','SOURCE_DECRYPTION_FAILED','SOURCE_FETCH_FAILED','SOURCE_FORMAT','SOURCE_TIMEOUT','MODEL_TOO_LARGE','RATE_LIMITED','SHARING_DISABLED']) {
    let requests=0;
    const mock=t.mock.method(globalThis,'fetch',async()=>++requests===1
      ? new Response(JSON.stringify(metadata()))
      : new Response(JSON.stringify({ error:{ code,message:'https://private.example/model.stl?access=synthetic-secret' } }),{ status:502,headers:{ 'Content-Type':'application/json; charset=utf-8' } }));
    await assert.rejects(loadSharedModel(token,{ signal:new AbortController().signal,capabilities:null,safeMode:true,origin }),error=>{
      const message=(error as Error).message;
      assert(message.includes(`(${code})`));
      assert(!message.includes('private.example'));
      assert(!message.includes('synthetic-secret'));
      return true;
    });
    assert.equal(requests,2);
    mock.mock.restore();
  }
});

test('malformed or oversized error responses cancel safely and show only a fixed fallback', async t => {
  for(const kind of ['html','invalid-json','unknown-code','oversized']) {
    let requests=0,cancelled=false;
    const mock=t.mock.method(globalThis,'fetch',async()=>{
      if(++requests===1) return new Response(JSON.stringify(metadata()));
      const body=kind==='html'?'<html>synthetic-secret</html>':kind==='invalid-json'?'synthetic-secret':kind==='unknown-code'?JSON.stringify({ error:{ code:'__proto__',message:'synthetic-secret' } }):'synthetic-secret'.repeat(500);
      return new Response(new ReadableStream({ start(output){ output.enqueue(new TextEncoder().encode(body)); if(kind==='invalid-json'||kind==='unknown-code') output.close(); },cancel(){ cancelled=true; } }),{
        status:502,headers:{ 'Content-Type':kind==='html'?'text/html':'application/json' },
      });
    });
    await assert.rejects(loadSharedModel(token,{ signal:new AbortController().signal,capabilities:null,safeMode:true,origin }),error=>{
      assert.match((error as Error).message,/HTTP 502/);
      assert(!(error as Error).message.includes('synthetic-secret'));
      return true;
    });
    assert.equal(cancelled,kind==='html'||kind==='oversized');
    mock.mock.restore();
  }
});

test('workspace creation sends assigned sharing credentials only in the request, never in the address', async t => {
  const key = 'synthetic-test-key-'.repeat(3);
  const currentOrigin = window.location.origin;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/shares');
    assert.equal(init.method, 'POST');
    assert.equal((init.headers as Record<string, string>).Authorization, undefined);
    assert.equal(JSON.parse(String(init.body)).sharingUsername, 'test.sharer');
    assert.equal(JSON.parse(String(init.body)).sharingPassword, key);
    assert.equal(String(init.body).includes('fileDataURL'), false);
    return new Response(JSON.stringify({ token, url: `${currentOrigin}/s/${token}`, expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 201 });
  });
  const result = await createProtectedShare({ sourceUrl: 'https://dl.dropboxusercontent.com/model.stl', workspace, modelIdentity: 'b'.repeat(64), sharingUsername:'test.sharer',includeWorkspace:true }, key, new AbortController().signal);
  assert.equal(result.url, `${currentOrigin}/s/${token}`);
  assert.equal(result.url.includes(key), false);
});
test('model-only sharing excludes sharing credentials and uses a concealed public address',async t=>{
  t.mock.method(globalThis,'fetch',async(_path:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));assert.equal(body.includeWorkspace,false);assert.equal(body.sharingPassword,undefined);assert.equal(body.sharingUsername,undefined);
    assert.equal((init.headers as any).Authorization,undefined);
    return new Response(JSON.stringify({token,url:`${window.location.origin}/s/${token}`,expiresAt:'2099-01-01T00:00:00.000Z'}),{status:201});
  });
  const result=await createProtectedShare({sourceUrl:'https://dl.dropboxusercontent.com/model.3mf',workspace,modelIdentity:'b'.repeat(64),includeWorkspace:false,sharingUsername:'must-not-send'},'must-not-send-this-password',new AbortController().signal);
  assert(!result.url.includes('dropbox'));assert(!result.url.includes('password'));
});
test('signed-in workspace creation sends a name and expiry with a concealed source reference and no password',async t=>{
  t.mock.method(globalThis,'fetch',async(_path:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));assert.equal(init.credentials,'same-origin');assert.equal(body.sourceShareToken,'a'.repeat(64));assert.equal(body.sourceUrl,undefined);
    assert.equal(body.label,'Named workspace');assert.equal(body.expiresAt,'2099-01-01T00:00:00.000Z');assert.equal(body.sharingPassword,undefined);assert.equal(body.sharingUsername,undefined);
    return new Response(JSON.stringify({token,url:`${window.location.origin}/s/${token}`,expiresAt:'2099-01-01T00:00:00.000Z'}),{status:201});
  });
  await createProtectedShare({sourceShareToken:'a'.repeat(64),workspace,modelIdentity:'b'.repeat(64),includeWorkspace:true,label:'Named workspace',expiresAt:'2099-01-01T00:00:00.000Z'},'',new AbortController().signal);
});

test('superseded or cancelled model imports cannot receive an old snapshot', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(waitForSharedModelReady({ modelLoadState: { requestId: 'new', phase: 'ready' } }, 'old', signal, 100), /newer model/);
  await assert.rejects(waitForSharedModelReady({ modelLoadState: { requestId: 'old', phase: 'cancelled' } }, 'old', signal, 100), error => (error as Error).name === 'AbortError');
});


test('late protected download cannot overwrite a model opened by the user', () => {
  let imports = 0;
  const manager = { modelLoadState: { requestId: null, phase: 'idle' }, loadFiles() { imports++; } };
  const checkpoint = captureModelLoad(manager);
  manager.modelLoadState = { requestId: 'newer', phase: 'parsing' };
  assert.throws(() => beginSharedModelImport(manager, new File(['x'], 'model.stl'), checkpoint, new AbortController().signal), /newer model/);
  assert.equal(imports, 0);
});

test('shared import captures its own request before awaiting asynchronous file validation', async () => {
  let finish: () => void;
  const manager = {
    modelLoadState: { requestId: null, phase: 'idle' },
    loadFiles(_files, options) {
      assert.equal(options.shared, true);
      assert(options.signal instanceof AbortSignal);
      this.modelLoadState = { requestId: 'shared', phase: 'validating' };
      return new Promise<void>(resolve => { finish = resolve; });
    }
  };
  const job = beginSharedModelImport(manager, new File(['x'], 'model.stl'), captureModelLoad(manager), new AbortController().signal);
  assert.equal(job.requestId, 'shared');
  manager.modelLoadState = { requestId: 'newer', phase: 'ready' };
  finish!();
  await assert.rejects(job.completion, /newer model/);
});

test('3MF/GLB references stay same-origin and access metadata cannot elevate an invalid role',()=>{
  for(const extension of ['3mf','glb'])assert.equal(protectedModelPath(token,`/api/shares/${token}/model.${extension}`,origin),`${origin}/api/shares/${token}/model.${extension}`);
  const editable=validateShareResponse({...metadata(),role:'edit',revision:3,viewUrl:`${origin}/s/${'c'.repeat(64)}`},token,origin);
  assert.equal(editable.role,'edit');assert.equal(editable.revision,3);
  assert.throws(()=>validateShareResponse({...metadata(),role:'admin'},token,origin));
  assert.throws(()=>validateShareResponse({...metadata(),revision:0},token,origin));
  assert.throws(()=>validateShareResponse({...metadata(),viewUrl:'https://attacker.example/s/'+token},token,origin));
});
test('edit-link sharing sends the entered password only to a fixed same-origin endpoint',async t=>{
  const password='synthetic-creator-password-'.repeat(2);
  t.mock.method(globalThis,'fetch',async(path:string,init:RequestInit)=>{
    assert.equal(path,`/api/shares/${token}/edit-link`);assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
    assert.equal((init.headers as any).Authorization,`Bearer ${password}`);assert.equal(init.body,undefined);
    return new Response(JSON.stringify({url:`${origin}/s/${'c'.repeat(64)}`,role:'edit'}));
  });
  assert.equal(await requestEditWorkspaceLink(`/api/shares/${token}/edit-link`,password,new AbortController().signal),`${origin}/s/${'c'.repeat(64)}`);
  await assert.rejects(requestEditWorkspaceLink('https://attacker.example/edit-link',password,new AbortController().signal));
});
test('workspace saves include a revision and model identity and surface conflicts instead of retrying writes',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async(path:string,init:RequestInit)=>{
    calls++;assert.equal(path,`/api/shares/${token}`);assert.equal(init.method,'PUT');assert.equal(init.credentials,'omit');
    assert.deepEqual(JSON.parse(String(init.body)),{workspace,modelIdentity:'b'.repeat(64),revision:1});
    return new Response(JSON.stringify({error:{code:'WORKSPACE_CONFLICT',message:'unsafe server text'}}),{status:409,headers:{'Content-Type':'application/json'}});
  });
  await assert.rejects(saveProtectedWorkspace(token,{workspace,modelIdentity:'b'.repeat(64),revision:1},new AbortController().signal),/WORKSPACE_CONFLICT/);
  assert.equal(calls,1);
});
