/* ══════════════════════════════════════════════════════════════
   NOVA MOTION — frame ticker
   One rAF loop for the whole system. Loops stop when nothing
   is animating (docs/02-motion-language.md §10 "Idle is idle").
   ══════════════════════════════════════════════════════════════ */

const subscribers = new Set();
let running = false;
let last = 0;

export const stats = {
  fps: 0,
  frameCount: 0,
  worstFrame: 0,
  active: 0,
  lastTransition: '—',
};

let fpsWindow = 0;
let fpsFrames = 0;

function loop(now) {
  const dt = Math.min(now - last, 64) / 1000;
  last = now;
  stats.frameCount++;
  stats.worstFrame = Math.max(stats.worstFrame, dt * 1000);

  fpsWindow += dt;
  fpsFrames++;
  if (fpsWindow >= 0.5) {
    stats.fps = Math.round(fpsFrames / fpsWindow);
    fpsWindow = 0;
    fpsFrames = 0;
    stats.worstFrame = Math.max(0, stats.worstFrame - 4);
  }

  for (const fn of Array.from(subscribers)) {
    if (!subscribers.has(fn)) continue;
    try {
      fn(dt, now);
    } catch (error) {
      // One broken/detached surface must not kill the shared animation loop.
      // Drop it so the exception cannot repeat on every frame.
      subscribers.delete(fn);
      console.error('[nova] animation callback failed:', error);
    }
  }
  stats.active = subscribers.size;

  if (subscribers.size === 0) {
    running = false;
    return;
  }
  requestAnimationFrame(loop);
}

/** Subscribe a per-frame callback. Returns an unsubscribe function. */
export function onFrame(fn) {
  subscribers.add(fn);
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
  return () => subscribers.delete(fn);
}
