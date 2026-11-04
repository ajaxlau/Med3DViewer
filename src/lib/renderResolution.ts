import type { GpuCapabilities } from './gpuDetection';
import { getDeviceLoadProfile } from './modelLoading';

interface PixelRatioRenderer {
  setPixelRatio: (ratio?: number) => void;
}

const limits = new WeakMap<PixelRatioRenderer, { getLimit: () => number }>();

// The embedded viewer resets pixel ratio on every resize. Enforce the current
// quality limit at the renderer boundary so those resets also respect it.
export function enforcePixelRatioLimit(renderer: PixelRatioRenderer, getLimit: () => number): void {
  const existing = limits.get(renderer);
  if (existing) {
    existing.getLimit = getLimit;
    return;
  }
  const state = { getLimit };
  const setPixelRatio = renderer.setPixelRatio.bind(renderer);
  renderer.setPixelRatio = ratio => setPixelRatio(
    ratio === undefined ? ratio : Math.min(ratio, state.getLimit())
  );
  limits.set(renderer, state);
}

// Load admission and framebuffer resolution share the same device policy. Safe
// Mode can tighten that policy but must never raise a legacy device's cap.
export function getRenderPixelRatioCap(capabilities: GpuCapabilities | null, safeMode = false): number {
  const cap = getDeviceLoadProfile(capabilities, false).pixelRatioCap;
  return safeMode ? Math.min(cap, getDeviceLoadProfile(capabilities, true).pixelRatioCap) : cap;
}
