import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginSharedModelImport, captureModelLoad, createProtectedShare, loadSharedModel, protectedModelPath, readBoundedBytes,
  sha256Hex, tokenFromSharePath, validateShareResponse, waitForSharedModelReady,
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
    `/api/shares/${token}/model.stl#secret`, `/api/shares/${token}/model.glb`,
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

test('share creation authenticates with a header and excludes creator key from JSON/address', async t => {
  const key = 'synthetic-test-key-'.repeat(3);
  const currentOrigin = window.location.origin;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/shares');
    assert.equal(init.method, 'POST');
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${key}`);
    assert.equal(String(init.body).includes(key), false);
    assert.equal(String(init.body).includes('fileDataURL'), false);
    return new Response(JSON.stringify({ token, url: `${currentOrigin}/s/${token}`, expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 201 });
  });
  const result = await createProtectedShare({ sourceUrl: 'https://models.example/model.stl', workspace, modelIdentity: 'b'.repeat(64) }, key, new AbortController().signal);
  assert.equal(result.url, `${currentOrigin}/s/${token}`);
  assert.equal(result.url.includes(key), false);
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
      assert.deepEqual(options, { shared: true });
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
