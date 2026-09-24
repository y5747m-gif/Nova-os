/* ══════════════════════════════════════════════════════════════
   NOVA LAUNCH RITUAL — انميشن اختيار التطبيق
   Tapping an app doesn't "just open" — the icon lifts off as a
   glass bubble, arcs up to the middle of the screen, pops in a
   spark of NOVA light, the NOVA OS wordmark flashes with a
   dazzling shine, and the app blooms open from the pop point.
   Physics through NovaMotion · keyframes are CSS-only · reduced
   motion (or no source) opens instantly.
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS } from '../core/store.js';
import { isNativeLauncher, realAppIcon, realAppLabel } from '../core/launcher.js';
import NovaMotion from '../motion/motion.js';

/** The pop point: a small square at the middle of the screen. */
export function popRect(screen) {
  const s = 92;
  return {
    x: (screen.clientWidth - s) / 2,
    y: (screen.clientHeight - s) / 2,
    w: s,
    h: s,
  };
}

/** True when the full ritual should play (motion allowed + a real source). */
export function canPlayLaunch(sourceEl) {
  if (!sourceEl || !sourceEl.getBoundingClientRect) return false;
  return document.body?.dataset?.motion !== 'reduced';
}

/**
 * Play the ritual. `onPop` fires at the burst — the app opens there.
 * Returns a handle whose .cancel() aborts silently (never calls onPop).
 */
export function playAppLaunch({ srcRect, appId, overlay, screen, fx, onPop }) {
  const cx = screen.clientWidth / 2;
  const cy = screen.clientHeight / 2;
  const sx = srcRect.x + srcRect.w / 2;
  const sy = srcRect.y + srcRect.h / 2;
  const size = Math.max(48, Math.min(66, srcRect.w || 54));

  /* the face: a real icon inside the APK, a NOVA glyph in the demo */
  const meta = APPS[appId];
  const real = !meta;
  const face = real
    ? h('img', {
      class: 'launch__img',
      src: isNativeLauncher() ? realAppIcon(appId) : '',
      alt: realAppLabel(appId) || '',
      draggable: 'false',
    })
    : h('span', { class: 'launch__ico', style: { color: meta.color }, html: icon(meta.icon, 'ico') });

  const bubble = h('div', {
    class: 'launch__bubble',
    style: { width: `${size}px`, height: `${size}px` },
  }, face);
  overlay.append(bubble);

  let cancelled = false;
  let popped = false;

  const place = (x, y, scale) => {
    const px = `${(x - size / 2).toFixed(1)}px`;
    const py = `${(y - size / 2).toFixed(1)}px`;
    bubble.style.setProperty('--lx', px);
    bubble.style.setProperty('--ly', py);
    bubble.style.transform = `translate3d(${px}, ${py}, 0) scale(${scale.toFixed(3)})`;
  };
  place(sx, sy, 0.62);

  /* the arc: x tracks the destination, y bows outward on the way up */
  const rise = Math.max(60, Math.abs(sy - cy) * 0.22 + 26);
  NovaMotion.spring({
    from: 0, to: 1, springName: 'SNAP',
    onUpdate: (v) => {
      if (cancelled || popped) return;
      const k = Math.min(1, v);
      const x = sx + (cx - sx) * k;
      const y = sy + (cy - sy) * k - Math.sin(k * Math.PI) * rise;
      place(x, y, 0.62 + 0.73 * k);
    },
    onDone: () => pop(),
  });
  // physics decides the path; this guarantees the beat (≤ 420ms)
  const beat = setTimeout(() => pop(), 420);

  function pop() {
    if (cancelled || popped) return;
    popped = true;
    clearTimeout(beat);
    place(cx, cy, 1.35);

    /* the bubble bursts */
    bubble.classList.add('launch__bubble--pop');
    const drop = () => bubble.remove();
    bubble.addEventListener('animationend', drop, { once: true });
    setTimeout(drop, 600);

    /* a shockwave ring from the pop */
    try {
      const ring = h('div', { class: 'launch__ring' });
      overlay.append(ring);
      ring.addEventListener('animationend', () => ring.remove(), { once: true });
      setTimeout(() => ring.remove(), 800);
    } catch { /* ignore */ }

    /* NOVA OS — a dazzling shine at the heart of the screen */
    try {
      const brand = h('div', { class: 'launch__brand' },
        h('img', { class: 'launch__brand-mark', src: 'icons/icon-192.png', alt: '' }),
        h('span', { class: 'launch__word', text: 'NOVA OS' }),
        h('i', { class: 'launch__star launch__star--a', text: '✦' }),
        h('i', { class: 'launch__star launch__star--b', text: '✦' }),
        h('i', { class: 'launch__star launch__star--c', text: '✧' }),
      );
      overlay.append(brand);
      setTimeout(() => brand.remove(), 1150);
    } catch { /* ignore */ }

    /* sparks + the open sound/haptic, then the app blooms from here */
    try { fx?.burst(cx, cy, meta?.color || '', 30); } catch { /* ignore */ }
    NovaMotion.emit('open');
    onPop?.();
  }

  return {
    cancel() {
      cancelled = true;
      clearTimeout(beat);
      bubble.remove();
    },
  };
}
