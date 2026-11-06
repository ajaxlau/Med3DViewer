import assert from 'node:assert/strict';
import test from 'node:test';
import { enforcePixelRatioLimit } from '../src/lib/renderResolution.ts';

test('engine resize requests respect the Safe Mode pixel-ratio limit', () => {
  const values: (number | undefined)[] = [];
  const renderer = { setPixelRatio: (ratio?: number) => { values.push(ratio); } };
  enforcePixelRatioLimit(renderer, () => 1);
  renderer.setPixelRatio(2);
  renderer.setPixelRatio(3);
  assert.deepEqual(values, [1, 1]);
});

test('quality changes take effect on subsequent resizes and retain lower requested ratios', () => {
  let cap = 1;
  const values: (number | undefined)[] = [];
  const renderer = { setPixelRatio: (ratio?: number) => { values.push(ratio); } };
  enforcePixelRatioLimit(renderer, () => cap);
  renderer.setPixelRatio(2);
  cap = 1.5;
  renderer.setPixelRatio(2);
  cap = 2;
  renderer.setPixelRatio(2);
  renderer.setPixelRatio(0.75);
  assert.deepEqual(values, [1, 1.5, 2, 0.75]);
});

test('reinstalling the policy updates its limit without retaining an older wrapper', () => {
  const renderer = { value: 0, setPixelRatio(ratio?: number) { this.value = ratio ?? 0; } };
  enforcePixelRatioLimit(renderer, () => 1);
  const wrapped = renderer.setPixelRatio;
  enforcePixelRatioLimit(renderer, () => 2);
  assert.equal(renderer.setPixelRatio, wrapped);
  renderer.setPixelRatio(2);
  assert.equal(renderer.value, 2);
});

test('an undefined ratio keeps the upstream setter behavior and renderer binding', () => {
  const renderer = { calls: 0, value: 1 as number | undefined,
    setPixelRatio(ratio?: number) { this.calls++; this.value = ratio; } };
  enforcePixelRatioLimit(renderer, () => 1);
  renderer.setPixelRatio();
  assert.equal(renderer.calls, 1);
  assert.equal(renderer.value, undefined);
});

import { getRenderPixelRatioCap } from '../src/lib/renderResolution.ts';
import type { GpuCapabilities } from '../src/lib/gpuDetection.ts';

const device = (overrides: Partial<GpuCapabilities> = {}): GpuCapabilities => ({
  tier: 'webgpu', adapterName: 'Fixture GPU', vendor: 'fixture', architecture: 'fixture', features: [],
  isFallback: false, isLowMemoryDevice: false, isMobileDevice: false, isSoftwareRenderer: false,
  recommendedPixelRatio: 2, memoryBudgetMB: 1024, ...overrides,
});

test('mobile and low-memory capabilities cap resolution even with WebGPU available', () => {
  assert.equal(getRenderPixelRatioCap(device({ isMobileDevice: true })), 1);
  assert.equal(getRenderPixelRatioCap(device({ isLowMemoryDevice: true })), 1);
  assert.equal(getRenderPixelRatioCap(device({ isFallback: true })), 1);
  assert.equal(getRenderPixelRatioCap(device()), 1.5);
});

test('Safe Mode only tightens resolution and never increases a legacy device cap', () => {
  assert.equal(getRenderPixelRatioCap(device(), true), 1);
  const legacy = device({ architecture: 'Legacy WebGL' });
  assert.equal(getRenderPixelRatioCap(legacy), 0.75);
  assert.equal(getRenderPixelRatioCap(legacy, true), 0.75);
  assert.equal(getRenderPixelRatioCap(null, true), 0.75);
});

test('mobile render policy survives orientation changes and live Safe Mode changes', () => {
  let capabilities = device({ isMobileDevice: true });
  let safeMode = false;
  const values: number[] = [];
  const renderer = { setPixelRatio: (ratio?: number) => { values.push(ratio!); } };
  enforcePixelRatioLimit(renderer, () => getRenderPixelRatioCap(capabilities, safeMode));
  renderer.setPixelRatio(3);
  renderer.setPixelRatio(2);
  capabilities = device();
  renderer.setPixelRatio(3);
  safeMode = true;
  renderer.setPixelRatio(3);
  assert.deepEqual(values, [1, 1, 1.5, 1]);
});
