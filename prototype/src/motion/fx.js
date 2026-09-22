/* ══════════════════════════════════════════════════════════════
   NOVA FX — the living wallpaper layer (docs/02 §5 "Depth")
   A GPU-cheap particle field (fireflies + aurora dust) painted on one
   canvas, driven by the shared ticker — no private rAF loops, and it
   freezes the moment the system goes idle or Reduced Motion is on.
   ══════════════════════════════════════════════════════════════ */

import { onFrame } from './ticker.js';
import { clamp01 } from '../core/dom.js';

const TAU = Math.PI * 2;

function accentPalette() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const pick = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
    return [pick('--nv-accent', '#6c5ce7'), pick('--nv-accent-2', '#22d3ee'), pick('--nv-bloom', '#ff6b9a')];
  } catch {
    return ['#6c5ce7', '#22d3ee', '#ff6b9a'];
  }
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return [108, 92, 231];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Attach the living layer to a <canvas>. Safe to call anywhere (jsdom,
 * no-2d-context, hidden tab): it degrades to a no-op.
 */
export function createFx(canvas, opts = {}) {
  const api = {
    burst() {}, setIntensity() {}, refresh() {}, stop() {}, setParallax() {},
    get running() { return false; },
  };
  if (!canvas || typeof canvas.getContext !== 'function') return api;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  if (!ctx) return api;

  const P = {
    density: opts.density ?? 1,
    intensity: 1,
    px: 0, py: 0, // parallax offset (-1..1), eased toward the target
    tpx: 0, tpy: 0,
    palette: accentPalette(),
    reduced: false,
  };

  let W = 0; let H = 0; let dpr = 1;
  let motes = [];
  let sparks = [];
  let off = null;
  let last = 0;

  function resize() {
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 390, height: 844 };
    dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
    W = Math.max(2, Math.round((r.width || 390) * dpr));
    H = Math.max(2, Math.round((r.height || 844) * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    seed();
  }

  function seed() {
    const n = Math.round(Math.min(90, Math.max(18, (W * H) / (22000 * dpr * dpr))) * P.density);
    motes = Array.from({ length: n }, () => spawn(true));
  }

  function spawn(anywhere = false) {
    const c = P.palette[(Math.random() * P.palette.length) | 0];
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 8,
      r: (0.7 + Math.random() * 1.9) * dpr,
      vy: (4 + Math.random() * 14) * dpr,     // drift upward, px/s
      sway: (Math.random() * TAU),
      swaySpd: 0.3 + Math.random() * 0.9,
      swayAmp: (2 + Math.random() * 9) * dpr,
      tw: Math.random() * TAU,                 // twinkle phase
      twSpd: 0.6 + Math.random() * 1.8,
      a: 0.25 + Math.random() * 0.55,
      rgb: hexToRgb(c),
    };
  }

  function frame(dt) {
    const now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    const step = Math.min(dt, 0.05);
    P.reduced = false;
    try {
      P.reduced = document.body?.dataset?.motion === 'reduced';
    } catch { /* ignore */ }

    // parallax eases toward its target — the wallpaper breathes with the device
    P.px += (P.tpx - P.px) * Math.min(1, step * 3.2);
    P.py += (P.tpy - P.py) * Math.min(1, step * 3.2);

    ctx.clearRect(0, 0, W, H);
    if (P.intensity <= 0.01) return;

    const ox = P.px * 14 * dpr;
    const oy = P.py * 18 * dpr;

    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      if (!P.reduced) {
        m.y -= m.vy * step * P.intensity;
        m.sway += m.swaySpd * step;
        m.tw += m.twSpd * step;
        if (m.y < -12) motes[i] = spawn(false);
      }
      const x = m.x + Math.sin(m.sway) * m.swayAmp + ox * (0.4 + m.r * 0.12);
      const y = m.y + oy * (0.4 + m.r * 0.12);
      const tw = P.reduced ? 0.7 : (0.55 + 0.45 * Math.sin(m.tw));
      const alpha = clamp01(m.a * tw * P.intensity);
      if (alpha <= 0.01) continue;
      const [rr, gg, bb] = m.rgb;
      const g = ctx.createRadialGradient(x, y, 0, x, y, m.r * 3.2);
      g.addColorStop(0, `rgba(${rr},${gg},${bb},${alpha.toFixed(3)})`);
      g.addColorStop(0.35, `rgba(${rr},${gg},${bb},${(alpha * 0.5).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, m.r * 3.2, 0, TAU);
      ctx.fill();
    }

    // celebration sparks — short-lived, gravity-kissed
    if (sparks.length) {
      sparks = sparks.filter((s) => s.life > 0);
      for (const s of sparks) {
        s.life -= step;
        s.vy += 130 * dpr * step;
        s.vx *= (1 - 1.6 * step);
        s.x += s.vx * step;
        s.y += s.vy * step;
        const k = clamp01(s.life / s.max);
        const [rr, gg, bb] = s.rgb;
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${(k * 0.9 * P.intensity).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(0.4, s.r * k * dpr), 0, TAU);
        ctx.fill();
      }
    }
    last = now;
  }

  resize();
  try {
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas.parentElement);
      api.stop = () => { try { ro.disconnect(); } catch {} off?.(); off = null; };
    }
  } catch { /* ignore */ }
  off = onFrame(frame);

  return {
    /** Celebration burst at canvas-local px (callers pass CSS px × dpr via rect math). */
    burst(x, y, color, n = 26) {
      const rgb = hexToRgb(color || P.palette[(Math.random() * P.palette.length) | 0]);
      const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      const sx = r && r.width ? W / r.width : dpr;
      const sy = r && r.height ? H / r.height : dpr;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = (60 + Math.random() * 260) * dpr;
        sparks.push({
          x: x * sx, y: y * sy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120 * dpr,
          r: 1.4 + Math.random() * 2.6,
          life: 0.5 + Math.random() * 0.7, max: 1.2,
          rgb,
        });
      }
      if (sparks.length > 420) sparks.splice(0, sparks.length - 420);
    },
    setIntensity(v) { P.intensity = Math.max(0, Math.min(1.4, v)); },
    setParallax(x, y) {
      P.tpx = Math.max(-1, Math.min(1, x));
      P.tpy = Math.max(-1, Math.min(1, y));
    },
    refresh() { P.palette = accentPalette(); seed(); },
    stop() { off?.(); off = null; },
    resize,
    get running() { return !!off; },
    get lastTick() { return last; },
  };
}
