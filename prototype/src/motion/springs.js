/* ══════════════════════════════════════════════════════════════
   NOVA MOTION — springs
   a = ( -k·(x - target) - c·v ) / m   with damping ratio ζ = c / (2·√(k·m))
   Integrated semi-implicitly at a fixed substep.
   ══════════════════════════════════════════════════════════════ */

import { onFrame } from './ticker.js';

export const SPRINGS = {
  SOFT:    { stiffness: 180, damping: 22, mass: 1.0 }, // ζ ≈ .82 — panels, sheets
  SNAP:    { stiffness: 320, damping: 30, mass: 1.0 }, // ζ ≈ .84 — buttons, toggles
  LIQUID:  { stiffness: 120, damping: 14, mass: 1.1 }, // ζ ≈ .63 — Liquid theme
  ORBIT:   { stiffness: 240, damping: 20, mass: 0.9 }, // ζ ≈ .65 — Orbit theme
  ELASTIC: { stiffness: 260, damping: 16, mass: 1.0 }, // ζ ≈ .50 — small overshoot
  HEAVY:   { stiffness: 90,  damping: 26, mass: 1.6 }, // ζ ≈ 1.08 — windows, canvas
};

const SUBSTEP = 1 / 240;
const MAX_OVERSHOOT = 0.06; // 6 % of travel, per the motion contract

/**
 * Settle thresholds are relative to the travel distance, so a 0→1 progress
 * spring and a 600 px panel spring stop at the same *visual* moment:
 * position within 0.6 % of travel (never more than 0.5 px) and slow enough.
 */
export function settleThresholds(travel = 1) {
  const dist = Math.abs(travel) || 1;
  const settleX = Math.min(0.5, Math.max(0.002, dist * 0.006));
  return { settleX, settleV: Math.min(4, Math.max(0.02, settleX * 8)) };
}

export function dampingRatio(cfg) {
  return cfg.damping / (2 * Math.sqrt(cfg.stiffness * cfg.mass));
}

/** A spring that cannot overshoot at all. */
export function criticallyDamped(cfg) {
  return { ...cfg, damping: 2 * Math.sqrt(cfg.stiffness * cfg.mass) };
}

/**
 * Clamp a spring's damping so overshoot never exceeds 6 % of travel.
 * Peak overshoot = e^(-πζ/√(1-ζ²)), so 6 % needs ζ ≥ 0.667 — we use 0.68 (≈5.4 %).
 */
export const MIN_ZETA = 0.68;

export function capOvershoot(cfg) {
  const z = dampingRatio(cfg);
  if (z >= 1) return cfg;
  if (z < MIN_ZETA) return { ...cfg, damping: MIN_ZETA * 2 * Math.sqrt(cfg.stiffness * cfg.mass) };
  return cfg;
}

export function integrate(state, target, cfg, dt) {
  const { stiffness: k, damping: c, mass: m } = cfg;
  let steps = Math.min(Math.ceil(dt / SUBSTEP), 24);
  const h = dt / steps;
  while (steps-- > 0) {
    const a = (-k * (state.x - target) - c * state.v) / m;
    state.v += a * h;
    state.x += state.v * h;
  }
}

export function isSettled(state, target, settleX = 0.4, settleV = 0.4) {
  return Math.abs(state.x - target) < settleX && Math.abs(state.v) < settleV;
}

/**
 * Animate a value with spring physics.
 * Returns { stop, retarget(target, velocity), value, velocity, done }
 * — retarget() preserves velocity, so springs are always interruptible (M6).
 */
export function spring({ from = 0, to = 0, velocity = 0, config = SPRINGS.SOFT, travel, onUpdate, onDone }) {
  const cfg = config;
  const state = { x: from, v: velocity };
  let target = to;
  let stopped = false;
  let settledFrames = 0;
  let thresholds = settleThresholds(travel ?? (to - from));

  const off = onFrame((dt) => {
    if (stopped) return;
    integrate(state, target, cfg, dt);
    if (isSettled(state, target, thresholds.settleX, thresholds.settleV)) {
      settledFrames++;
      if (settledFrames >= 2) {
        state.x = target;
        state.v = 0;
        stop();
        onUpdate?.(state.x, 0);
        onDone?.(state.x);
        return;
      }
    } else {
      settledFrames = 0;
    }
    onUpdate?.(state.x, state.v);
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    off();
  }

  return {
    stop,
    retarget(next, vel) {
      thresholds = settleThresholds(Math.abs(next - state.x));
      target = next;
      if (typeof vel === 'number') state.v = vel;
      settledFrames = 0;
    },
    get value() { return state.x; },
    get velocity() { return state.v; },
    get done() { return stopped; },
  };
}

/** Peak overshoot fraction for a given spring (used by tests & the deck). */
export function overshootOf(cfg) {
  const z = dampingRatio(cfg);
  if (z >= 1) return 0;
  return Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z));
}

export const MOTION_LIMITS = { MAX_OVERSHOOT };
