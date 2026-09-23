/* ══════════════════════════════════════════════════════════════
   Shared golden-curve simulator — the ONE reference trajectory.
   Used by tools/spring-check.mjs (budgets) and
   tools/golden-curves.mjs (the JSON the Kotlin port asserts).
   Must stay a byte-for-byte mirror of the loop in
   tools/spring-check.mjs' original `simulate` (docs/02 §11).
   ══════════════════════════════════════════════════════════════ */

import { integrate, isSettled, settleThresholds } from '../../prototype/src/motion/springs.js';

export const DT = 1 / 60;
export const MAX_T = 3.0;

/**
 * Simulate a spring from `from` to `to` at a fixed 60 Hz frame step,
 * optionally re-targeting mid-flight (M6). Returns the full trace plus
 * the budget stats the motion contract asserts on.
 */
export function simulate(cfg, { from = 0, to = 1, velocity = 0, retarget = null } = {}) {
  const st = { x: from, v: velocity };
  let target = to;
  let t = 0;
  let peak = from;
  let settledAt = null;
  let jumpedBack = false;
  let last = from;
  const trace = [];

  while (t < MAX_T) {
    if (retarget && Math.abs(t - retarget.at) < DT) {
      target = retarget.to;
      st.v = retarget.velocity ?? st.v;
    }
    integrate(st, target, cfg, DT);
    t += DT;
    peak = Math.max(peak, st.x);
    if (target > last && st.x < last - 1e-6 && st.x > 0) jumpedBack = true; // no rubber-band after commit
    last = st.x;
    trace.push(st.x);
    const th = settleThresholds(Math.abs(target - from));
    if (settledAt === null && isSettled(st, target, th.settleX, th.settleV)) settledAt = t;
  }
  return { overshoot: Math.max(0, (peak - to) / (to - from || 1)), settle: settledAt ?? Infinity, jumpedBack, trace };
}
