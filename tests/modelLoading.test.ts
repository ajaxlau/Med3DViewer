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
