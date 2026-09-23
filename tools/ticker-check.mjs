// Deterministic regression: a surface throwing once used to freeze all motion
// permanently because `running` stayed true without a queued animation frame.
import assert from 'node:assert/strict';
const frames = [];
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
const { onFrame, stats } = await import('../prototype/src/motion/ticker.js');
let now = performance.now();
function tick() {
  assert.equal(frames.length, 1, 'only one shared frame loop');
  frames.shift()(now += 16);
}
const errors = [];
const originalError = console.error;
console.error = (...args) => errors.push(args);
try {
  let healthy = 0;
  let broken = 0;
  onFrame(() => { broken++; throw new Error('detached surface'); });
  const stop = onFrame(() => { healthy++; });
  tick(); tick();
  assert.equal(broken, 1, 'broken subscriber is removed');
  assert.equal(healthy, 2, 'other surfaces keep animating');
  assert.equal(errors.length, 1, 'failure is reported once');
  stop(); tick();
  assert.equal(frames.length, 0, 'idle loop stops');
  assert.equal(stats.active, 0);
  const restart = onFrame(() => { healthy++; });
  tick();
  assert.equal(healthy, 3, 'new animations can start after failure and idle');
  restart(); tick();
  let removedCalled = false;
  let removeLater;
  const removeFirst = onFrame(() => removeLater());
  removeLater = onFrame(() => { removedCalled = true; });
  tick();
  assert.equal(removedCalled, false, 'callbacks removed mid-frame are not run');
  removeFirst(); tick();
  assert.equal(frames.length, 0);
} finally {
  console.error = originalError;
}
console.log('PASS ticker failure isolation, recovery, unsubscription and idle');
