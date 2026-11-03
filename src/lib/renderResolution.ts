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
