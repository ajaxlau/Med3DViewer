import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaybackPublisher } from '../src/lib/playbackNotifications.ts';

const initial = { active: true, isPlaying: true, progress: 0, currentDistance: 0, speed: 1, fov: 75 };

test('playback text updates are bounded while the latest camera state remains independent', () => {
  let now = 0;
  const received: typeof initial[] = [];
  const emit = createPlaybackPublisher<typeof initial>(state => received.push(state), () => now);
  const cameraState = { ...initial };
  for (now = 0; now <= 200; now += 10) {
    cameraState.progress = now / 1000;
    cameraState.currentDistance = now;
    emit(cameraState);
  }
  assert.deepEqual(received.map(state => state.currentDistance), [0, 100, 200]);
  assert.equal(cameraState.currentDistance, 200);
  assert.equal(received[0].currentDistance, 0, 'published snapshots do not mutate with the camera');
});

test('pause/end/exit and user control changes publish without waiting for the interval', () => {
  let now = 0;
  const received: typeof initial[] = [];
  const emit = createPlaybackPublisher<typeof initial>(state => received.push(state), () => now);
  emit(initial);
  now = 5;
  emit({ ...initial, progress: 0.2, currentDistance: 20 });
  emit({ ...initial, speed: 2 });
  emit({ ...initial, speed: 2, isPlaying: false, progress: 1, currentDistance: 100 });
  emit({ ...initial, active: false, isPlaying: false });
  assert.equal(received.length, 4);
  assert.equal(received[1].speed, 2);
  assert.equal(received[2].progress, 1);
  assert.equal(received[3].active, false);
});
