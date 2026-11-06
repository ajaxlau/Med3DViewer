interface PlaybackState {
  active: boolean;
  isPlaying: boolean;
  progress: number;
  currentDistance: number;
}

// The camera advances on every animation frame. Text/progress consumers do not
// need to rerender the full React provider at the same frequency. Control and
// lifecycle changes, including the final paused state, must remain immediate.
export function createPlaybackPublisher<T extends PlaybackState>(
  publish: (state: T) => void,
  clock: () => number = () => performance.now(),
  minimumIntervalMs = 100,
): (state: T) => void {
  let previous: T | undefined;
  let previousTime = -Infinity;
  return state => {
    const time = clock();
    const controlsChanged = !previous || (Object.keys(state) as (keyof T)[]).some(
      key => key !== 'progress' && key !== 'currentDistance' && state[key] !== previous[key]
    );
    if (!previous || !state.isPlaying || controlsChanged || time - previousTime >= minimumIntervalMs) {
      previous = { ...state };
      previousTime = time;
      publish(previous);
    }
  };
}
