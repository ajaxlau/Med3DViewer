import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDeviceLoadProfile,
  ModelLoadException,
  sniffModelFile,
  validateLocalFiles,
  validateRemoteModelUrl,
} from '../src/lib/modelLoading.ts';

Object.defineProperty(globalThis, 'window', {
  value: { location: new URL('https://viewer.example/app/') }, configurable: true
});
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true }, configurable: true
});

test('remote URL validation rejects insecure mixed content and credentials', () => {
  assert.throws(() => validateRemoteModelUrl('http://models.example/model.stl'), (error: unknown) => error instanceof ModelLoadException && error.code === 'URL_INSECURE');
  assert.throws(() => validateRemoteModelUrl('https://user:secret@models.example/model.stl'), (error: unknown) => error instanceof ModelLoadException && error.code === 'URL_INVALID');
});

test('remote URL validation accepts HTTPS and removes fragments', () => {
  assert.equal(validateRemoteModelUrl('https://models.example/model.glb#private').href, 'https://models.example/model.glb');
});

test('Dropbox SCL file links resolve to CORS-enabled content and retain their access key', () => {
  const url = validateRemoteModelUrl('https://www.dropbox.com/scl/fi/example-id/model.3mf?rlkey=example-key&st=example-tracking&dl=0#preview');
  assert.equal(url.hostname, 'dl.dropboxusercontent.com');
  assert.equal(url.pathname, '/scl/fi/example-id/model.3mf');
  assert.equal(url.searchParams.get('rlkey'), 'example-key');
  assert.equal(url.searchParams.get('st'), 'example-tracking');
  assert.equal(url.searchParams.has('dl'), false);
  assert.equal(url.hash, '');
});

test('legacy Dropbox file links and download/render variants resolve to file content', () => {
  for (const host of ['dropbox.com', 'www.dropbox.com']) {
    for (const query of ['', '?dl=0', '?dl=1', '?raw=1', '?dl=0&raw=1']) {
      const url = validateRemoteModelUrl(`https://${host}/s/example-id/model%20name.stl${query}`);
      assert.equal(url.href, 'https://dl.dropboxusercontent.com/s/example-id/model%20name.stl');
    }
  }
});

test('Dropbox conversion leaves unrelated hosts, signed URLs, folders and existing content URLs unchanged', () => {
  for (const original of [
    'https://models.example/model.glb?dl=0&signature=a%2Fb%2Bc',
    'https://www.dropbox.com.example/model.stl?dl=0',
    'https://www.dropbox.com/scl/fo/folder-id/model.3mf?dl=0',
    'https://www.dropbox.com/home/model.3mf?dl=0',
    'https://www.dropbox.com:8443/s/example-id/model.stl?dl=0',
    'https://dl.dropboxusercontent.com/scl/fi/example-id/model.3mf?rlkey=example-key&dl=1',
  ]) assert.equal(validateRemoteModelUrl(original).href, original);
});

test('safe mode selects conservative mobile limits', () => {
  const profile = getDeviceLoadProfile(null, true);
  assert.equal(profile.name, 'mobile-safe');
  assert.equal(profile.pixelRatioCap, 1);
  assert.ok(profile.hardLimitBytes > profile.softLimitBytes);
});

test('local validation rejects unsupported and oversized selections', async () => {
  const profile = { ...getDeviceLoadProfile(null, true), hardLimitBytes: 10 };
  await assert.rejects(validateLocalFiles([new File(['hello'], 'model.exe')], profile), (error: unknown) => error instanceof ModelLoadException && error.code === 'FORMAT_UNSUPPORTED');
  await assert.rejects(validateLocalFiles([new File(['a'.repeat(20)], 'model.obj')], profile), (error: unknown) => error instanceof ModelLoadException && error.code === 'SIZE_LIMIT');
});

test('GLB and binary STL sniffing detects inconsistent headers', async () => {
  await assert.rejects(sniffModelFile(Object.assign(new Blob(['not glb data']), { name: 'bad.glb' })), (error: unknown) => error instanceof ModelLoadException && error.code === 'FORMAT_MISMATCH');
  const stl = new Uint8Array(84);
  new DataView(stl.buffer).setUint32(80, 2, true);
  await assert.rejects(sniffModelFile(Object.assign(new Blob([stl]), { name: 'bad.stl' })), (error: unknown) => error instanceof ModelLoadException && error.code === 'FORMAT_MISMATCH');
});
