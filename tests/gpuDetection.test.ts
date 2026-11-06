import assert from 'node:assert/strict';
import test from 'node:test';
import { detectGpuCapabilities } from '../src/lib/gpuDetection.ts';

function replaceGlobal(name: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  return () => descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
}

test('startup callers share an adapter probe without allocating a GPUDevice', async () => {
  let adapterRequests = 0;
  let deviceRequests = 0;
  const restoreNavigator = replaceGlobal('navigator', {
    userAgent: 'iPhone', maxTouchPoints: 5, hardwareConcurrency: 8,
    gpu: { requestAdapter: async () => {
      adapterRequests++;
      return {
        info: { vendor: 'fixture', architecture: 'mobile' }, features: new Set<string>(),
        limits: { maxTextureDimension2D: 8192, maxComputeWorkgroupSizeX: 256 },
        requestDevice: () => { deviceRequests++; throw new Error('Diagnostic must not allocate a device'); },
      };
    } },
  });
  const restoreWindow = replaceGlobal('window', { devicePixelRatio: 3 });
  try {
    const a = detectGpuCapabilities(true);
    const b = detectGpuCapabilities();
    assert.equal(a, b);
    const capabilities = await a;
    assert.equal(adapterRequests, 1);
    assert.equal(deviceRequests, 0);
    assert.equal(capabilities.tier, 'webgpu');
    assert.equal(capabilities.isMobileDevice, true);
    assert.equal(capabilities.recommendedPixelRatio, 1);
    await detectGpuCapabilities();
    assert.equal(adapterRequests, 1);
  } finally { restoreNavigator(); restoreWindow(); }
});
