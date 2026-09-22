/* ══════════════════════════════════════════════════════════════
   NOVA MOTION — the engine API
   The only way to animate inside NOVA surfaces (docs/02 §9).
   ══════════════════════════════════════════════════════════════ */

import { spring, SPRINGS, isSettled } from './springs.js';
import { stats } from './ticker.js';
import {
  springConfig, token, stagger as staggerMs, blurPx, arcBias, usesArcs, scaleCap, profile,
} from './config.js';

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);

/**
 * Release velocity, capped by the motion contract (docs/02 §3):
 * a flick may add energy, but it may never push the spring past the
 * 6 % overshoot budget. `velocity` is in normalised units per second,
 * already pointing at the target.
 */
export function capReleaseVelocity({ from, to, cfg, velocity }) {
  const omega = Math.sqrt(cfg.stiffness / cfg.mass);       // natural frequency
  const remaining = Math.max(0.12, Math.abs(to - from));    // units left to travel
  const cap = 0.32 * omega * remaining;
  return clamp(velocity, -cap, cap);
}

/** Bounding rect of an element, expressed inside `container`. */
export function rectOf(el, container) {
  const r = el.getBoundingClientRect();
  const c = container ? container.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
}

/* ══════════════════════════════════════════════════════════════
   Morph — the continuity primitive (M3)
   `el` is laid out at its destination; we paint it back at the
   source rect and interpolate everything on one transform.
   ══════════════════════════════════════════════════════════════ */
export function morph({
  el,
  from,
  to,
  radiusFrom = 22,
  radiusTo = 28,
  springName = 'SOFT',
  travel = 1,
  arc = 0,
  blur = 0,
  fade = 0,
  onProgress,
  onDone,
  manual = false,
}) {
  const dx = (from.x + from.w / 2) - (to.x + to.w / 2);
  const dy = (from.y + from.h / 2) - (to.y + to.h / 2);
  const sx0 = from.w / to.w;
  const sy0 = from.h / to.h;
  const cap = scaleCap();
  // Reduced Motion: never scale below (1 - cap) — position + fade instead.
  const sxc = Math.max(sx0, 1 - cap * 0.9);
  const syc = Math.max(sy0, 1 - cap * 0.9);
  // The arc: travel bends around the centre of mass instead of sliding flat.
  // Honours the motion contract — no arcs when the profile/theme forbids them.
  const dist = Math.hypot(dx, dy) || 1;
  const curved = usesArcs() ? arc : 0;
  const bend = curved * Math.min(dist, 560) * 0.22;
  const nx = -dy / dist;
  const ny = dx / dist;
  const blurBudget = blurPx() > 0 ? blur : 0;

  let p = manual ? 0 : 0;
  let handle = null;
  let finished = false;

  function apply(v) {
    const vv = clamp(v);
    const sx = lerp(sxc, 1, vv);
    const sy = lerp(syc, 1, vv);
    const bow = Math.sin(vv * Math.PI) * bend;
    const tx = dx * (1 - vv) + nx * bow;
    const ty = dy * (1 - vv) + ny * bow;
    el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    const rv = lerp(radiusFrom, radiusTo, vv) / Math.max(0.2, (sx + sy) / 2);
    el.style.borderRadius = `${rv.toFixed(2)}px`;
    el.style.transformOrigin = 'center center';
    if (blurBudget > 0) {
      const b = blurBudget * (1 - vv);
      el.style.filter = b > 0.4 ? `blur(${b.toFixed(1)}px)` : '';
    }
    if (fade > 0) el.style.opacity = String(clamp(1 - (1 - vv) * fade));
    onProgress?.(vv);
  }

  apply(manual ? p : 0);

  const api = {
    get progress() { return p; },
    /** Gesture-driven: the finger owns this value (M1). */
    set(v) {
      handle?.stop();
      handle = null;
      p = clamp(v);
      apply(p);
    },
    /** Release hands over to physics, seeded with the release velocity (M2). */
    release(dir = 'commit', velocity = 0) {
      if (finished) return;
      const target = dir === 'commit' ? 1 : 0;
      const cfg = springConfig(springName);
      const raw = (velocity / Math.max(1, travel)) * (dir === 'commit' ? 1 : -1);
      const vUnits = capReleaseVelocity({ from: p, to: target, cfg, velocity: raw });
      handle = spring({
        from: p,
        to: target,
        velocity: vUnits,
        config: springConfig(springName),
        onUpdate: (v) => { p = v; apply(v); },
        onDone: (v) => { finished = true; onDone?.(clamp(v) > 0.5 ? 'commit' : 'cancel', p); },
      });
    },
    snap(to) {
      handle?.stop();
      handle = null;
      finished = false;
      api.release(to >= 0.5 ? 'commit' : 'cancel', 0);
    },
    stop() { handle?.stop(); handle = null; },
    get isAnimating() { return !!handle && !handle.done; },
  };
  return api;
}

/* ══════════════════════════════════════════════════════════════
   Orbital — elements travel on an arc around a centre of mass
   ══════════════════════════════════════════════════════════════ */
export function orbital({
  items,
  center,
  radius,
  angleOf,
  stagger = 40,
  arc = 1,
  onUpdate,
  onProgress,
}) {
  const n = items.length;
  const totalStagger = (n - 1) * stagger;
  const span = totalStagger + 320; // ms of nominal travel
  let rafValue = 0;
  let handle = null;

  function layout(v) {
    const p = clamp(v);
    items.forEach((item, i) => {
      const start = (i * stagger) / span;
      const width = 1 - totalStagger / span;
      const ip = clamp((p - start) / width);
      const eased = usesArcs() ? ip : easeOut(ip);
      const targetAngle = angleOf(item, i);
      // arc: items sweep in from the hub, rotated by the theme's arc bias
      const angle = targetAngle + (1 - eased) * arcBias() * arc * 0.9;
      const r = lerp(radius * 0.28, radius, eased);
      const x = center.x + Math.cos(angle) * r;
      const y = center.y + Math.sin(angle) * r;
      const scale = lerp(0.72, 1, eased);
      const alpha = lerp(0, 1, clamp(eased * 1.35));
      onUpdate?.(item, i, { x, y, scale, alpha, p: eased });
    });
    onProgress?.(p);
  }

  layout(0);

  return {
    set(v) { handle?.stop(); handle = null; rafValue = clamp(v); layout(rafValue); },
    release(dir = 'commit', velocity = 0) {
      const target = dir === 'commit' ? 1 : 0;
      const cfg = springConfig('theme');
      handle = spring({
        from: rafValue,
        to: target,
        velocity: capReleaseVelocity({
          from: rafValue, to: target, cfg,
          velocity: (velocity / 420) * (dir === 'commit' ? 1 : -1),
        }),
        config: cfg,
        onUpdate: (v) => { rafValue = v; layout(v); },
      });
    },
    layout,
  };
}

/* ══════════════════════════════════════════════════════════════
   Cascade — one spring, many siblings (M4 "stagger")
   A single 0→1 progress value fans out over `items` with per-item
   stagger offsets. Timer-free: everything derives from the spring,
   so the cascade is scrubbable and always interruptible.
   ══════════════════════════════════════════════════════════════ */
export function cascade({
  items,
  stagger = 40,
  span = 460,
  springName = 'SOFT',
  from = 0,
  onUpdate,
  onProgress,
  onDone,
}) {
  const list = Array.from(items || []);
  const n = list.length;
  const totalStagger = Math.max(0, (n - 1) * stagger);
  const width = Math.max(80, span - totalStagger);
  let p = clamp(from);
  let handle = null;
  let finished = false;

  function layout(v) {
    const ms = clamp(v) * span;
    list.forEach((item, i) => {
      const ip = easeOut(clamp((ms - i * stagger) / width));
      onUpdate?.(item, i, ip, clamp(v));
    });
    onProgress?.(clamp(v));
  }

  layout(p);

  return {
    get progress() { return p; },
    set(v) {
      handle?.stop();
      handle = null;
      finished = false;
      p = clamp(v);
      layout(p);
    },
    release(dir = 'commit', velocity = 0) {
      if (finished && ((dir === 'commit' && p >= 1) || (dir === 'cancel' && p <= 0))) return;
      finished = false;
      const target = dir === 'commit' ? 1 : 0;
      const cfg = springConfig(springName);
      handle = spring({
        from: p,
        to: target,
        velocity: capReleaseVelocity({
          from: p, to: target, cfg,
          velocity: (velocity / 700) * (dir === 'commit' ? 1 : -1),
        }),
        config: cfg,
        onUpdate: (v) => { p = v; layout(v); },
        onDone: (v) => { finished = true; onDone?.(clamp(v) > 0.5 ? 'commit' : 'cancel', p); },
      });
    },
    layout,
  };
}

/* ══════════════════════════════════════════════════════════════
   Panels — bottom / top sheets driven by the same progress
   ══════════════════════════════════════════════════════════════ */
export function panel({ el, from = 'bottom', distance = 620, springName = 'SOFT', onProgress }) {
  let p = 0;
  let handle = null;
  const sign = from === 'bottom' ? 1 : -1;
  el.style.transformOrigin = from === 'bottom' ? 'bottom center' : 'top center';

  function apply(v) {
    p = clamp(v);
    const e = easeOut(p);
    el.style.transform =
      `translate3d(0, ${(sign * distance * (1 - e)).toFixed(2)}px, 0) scale(${(0.94 + 0.06 * e).toFixed(4)})`;
    el.style.opacity = String(clamp(p * 1.7));
    el.style.pointerEvents = p > 0.12 ? 'auto' : 'none';
    onProgress?.(p);
  }
  apply(0);

  return {
    get progress() { return p; },
    set(v) { handle?.stop(); handle = null; apply(v); },
    release(dirName = 'commit', velocity = 0) {
      const target = dirName === 'commit' ? 1 : 0;
      const cfg = springConfig(springName);
      handle = spring({
        from: p,
        to: target,
        velocity: capReleaseVelocity({
          from: p, to: target, cfg,
          velocity: (velocity / 700) * (dirName === 'commit' ? 1 : -1),
        }),
        config: cfg,
        onUpdate: apply,
      });
    },
    apply,
  };
}

/* ══════════════════════════════════════════════════════════════
   Depth — Z changes recede the background and approach the window
   ══════════════════════════════════════════════════════════════ */
export function depth({ layers, amount = 1 }) {
  const far = profile().scaleMax === 0.04 ? 0.01 : 0.04;
  let current = 0;
  let handle = null;
  function apply(v) {
    current = v;
    layers.forEach(({ el, factor = 1, dim = 0, blur = 0 }) => {
      const s = 1 - far * factor * v * amount;
      el.style.transform = `scale(${s.toFixed(4)})`;
      el.style.filter = blur && blurPx() ? `blur(${(blurPx() * v * blur).toFixed(1)}px)` : '';
      if (dim) el.style.opacity = String(1 - dim * v);
    });
  }
  return {
    set: (v) => { handle?.stop(); apply(clamp(v)); },
    to(v) {
      handle = spring({ from: current, to: v, config: springConfig('SOFT'), onUpdate: apply });
    },
  };
}

/* ══════════════════════════════════════════════════════════════
   emit — one event, three outputs (motion + sound + haptic)
   ══════════════════════════════════════════════════════════════ */
export const SOUND_EVENTS = ['open', 'close', 'success', 'error', 'tick', 'defer', 'orb', 'sweep'];

export function emit(kind, detail = {}) {
  stats.lastTransition = kind;
  window.dispatchEvent(new CustomEvent('nova:emit', { detail: { kind, ...detail } }));
}

export const NovaMotion = {
  clamp, lerp, rectOf, morph, orbital, cascade, panel, depth, emit,
  spring: (opts) => spring({ ...opts, config: opts.config || springConfig(opts.springName || 'SOFT') }),
  duration: token,
  stagger: staggerMs,
  stats,
  get profile() { return profile(); },
  springs: SPRINGS,
};

export default NovaMotion;
