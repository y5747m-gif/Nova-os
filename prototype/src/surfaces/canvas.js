/* ══════════════════════════════════════════════════════════════
   NOVA CANVAS — recents as a 2D workspace (docs/01 §10)
   Spatial memory: a window you left top-right is still there.
   Closes are a gesture (sweep), not a button.
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS, state, appMeta, rememberWindow, notify } from '../core/store.js';
import { previewFor } from './app.js';
import NovaMotion, { clamp } from '../motion/motion.js';
import { draggable } from '../motion/gestures.js';
import { isNativeLauncher, realAppIcon, realAppLabel, openWidgets } from '../core/launcher.js';

const GROUP = { label: '✈️ رحلة الغردقة', apps: ['browser', 'notes'] };

/** Close + restore state used by the window controls (desktop affordances). */
function closeWindow(ctx, appId) {
  state.windows = state.windows.filter((x) => x.appId !== appId);
  ctx.emit?.('close');
  notify('windows');
}

export function mountCanvas(layer, ctx = {}) {
  const grid = h('div', { class: 'canvas__grid' });
  const space = h('div', { class: 'canvas__space' });
  const bar = h('div', { class: 'canvas__bar' },
    h('h2', {}, 'NOVA CANVAS'),
    h('span', { class: 'pill', html: icon('layers', 'ico ico--sm') }),
    h('small', {}, 'مساحة ثنائية الأبعاد · الذاكرة المكانية'),
    isNativeLauncher() ? h('button', {
      class: 'pill canvas__widget-btn',
      dataset: { nodrag: '1' },
      onclick: () => openWidgets(),
    }, '＋ ودجت') : null,
  );
  const foot = h('div', { class: 'canvas__foot' },
    h('div', { class: 'pill' }, 'اسحب نافذة لتحريكها · اضغط لفتحها · اسحب لأعلى بسرعة للإغلاق الجماعي'),
  );
  const sweepHint = h('div', { class: 'sweep-hint' });

  const el = h('div', { class: 'canvas' }, grid, space, bar, foot, sweepHint);
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  layer.append(el);

  let pan = { x: 0, y: 0 };
  let zoom = 1;
  const winEls = new Map();

  function render() {
    space.replaceChildren();
    winEls.clear();

    // app group outline (docs/01 §10)
    const grouped = state.windows.filter((w) => GROUP.apps.includes(w.appId));
    if (grouped.length > 1) {
      const xs = grouped.map((w) => w.x), ys = grouped.map((w) => w.y);
      const x = Math.min(...xs) - 16, y = Math.min(...ys) - 20;
      const w = Math.max(...xs) + 208 - x + 16, hgt = Math.max(...ys) + 268 - y + 12;
      space.append(h('div', { class: 'win__group', style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hgt}px` } },
        h('span', {}, GROUP.label)));
    }

    for (const w of state.windows) {
      const meta = appMeta(w.appId);
      const real = !APPS[w.appId] && isNativeLauncher();
      const face = real
        ? h('img', { class: 'win__icon', src: realAppIcon(w.appId), alt: realAppLabel(w.appId), draggable: 'false' })
        : h('span', { style: { color: meta.color }, html: icon(meta.icon, 'ico ico--sm') });
      const win = h('div', {
        class: 'win',
        dataset: { app: w.appId, drag: 'win', focus: w.appId === state.focusedApp ? '1' : '0' },
        style: { left: `${w.x}px`, top: `${w.y}px`, transformOrigin: 'center' },
        onclick: (e) => { if (!win.dataset.moved) ctx.onOpenApp?.(w.appId, win); },
      },
        h('div', { class: 'win__head' },
          face,
          h('b', {}, real ? realAppLabel(w.appId) : meta.name),
          h('small', {}, real ? 'تطبيق' : 'مفتوح'),
          h('button', {
            class: 'win__btn win__btn--max', dataset: { nodrag: '1' },
            title: 'تكبير / استعادة', html: icon('maximize', 'ico ico--sm'),
            onclick: (e) => { e.stopPropagation(); toggleMax(win); },
          }),
          h('button', {
            class: 'win__btn win__btn--close', dataset: { nodrag: '1' },
            title: 'إغلاق', html: icon('close', 'ico ico--sm'),
            onclick: (e) => { e.stopPropagation(); closeWindow(ctx, w.appId); },
          }),
        ),
        h('div', { class: 'win__body', dataset: { nodrag: '1' } }, previewFor(w.appId)),
      );

      const head = win.querySelector('.win__head');
      head.addEventListener('dblclick', (e) => { e.stopPropagation(); toggleMax(win); });

      draggable(win, {
        axis: 'xy',
        onStart: () => {
          if (win.dataset.max === '1') unmaximize(win, false); // a dragged maximized window snaps free first
          win.dataset.moved = ''; win.style.zIndex = '5'; ctx.emit?.('tick');
        },
        onMove: (_e, d) => {
          win.dataset.moved = '1';
          const nx = w.x + d.dx, ny = w.y + d.dy;
          if (Math.abs(d.dx) > 3 || Math.abs(d.dy) > 3) {
            win.style.left = `${nx}px`;
            win.style.top = `${ny}px`;
            win.dataset.nx = String(nx);
            win.dataset.ny = String(ny);
          }
        },
        onEnd: (_e, d) => {
          win.style.zIndex = '';
          const nx = Number(win.dataset.nx ?? w.x);
          const ny = Number(win.dataset.ny ?? w.y);
          // dropped outside the canvas → closed (deferral of space, not a kill)
          const off = nx < -140 || nx > 400 || ny < -120 || ny > 900;
          if (off) {
            state.windows = state.windows.filter((x) => x.appId !== w.appId);
            ctx.emit?.('sweep');
            notify('windows');
            render();
          } else {
            rememberWindow(w.appId, nx, ny);
            NovaMotion.spring({
              from: 0, to: 0, springName: 'HEAVY',
              onUpdate: () => {},
            });
          }
          setTimeout(() => { win.dataset.moved = ''; }, 60);
        },
      });

      space.append(win);
      winEls.set(w.appId, win);
    }
  }

  // pan the canvas by dragging the empty background
  draggable(grid, {
    engage: 6,
    onMove: (_e, d) => {
      pan.x = d.dx; pan.y = d.dy;
      applySpace();
    },
    onEnd: () => {
      // snap back into a comfortable range, with physics
      NovaMotion.spring({
        from: pan.y, to: Math.max(-140, Math.min(60, pan.y)), springName: 'HEAVY',
        onUpdate: (v) => { pan.y = v; applySpace(); },
      });
    },
  });

  /* ── wheel zoom — computers scroll, thumbs pinch (desktop) ──── */
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = clamp(zoom * (1 - e.deltaY * 0.0012), 0.6, 1.5);
    applySpace();
  }, { passive: false });

  /* one transform for space + grid: pan × zoom, origin = centre */
  function applySpace() {
    el.dataset.zoom = zoom.toFixed(2);
    space.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;
    grid.style.transform = `translate3d(${pan.x * 0.35}px, ${pan.y * 0.35}px, 0) scale(${zoom})`;
  }

  function resetZoom() {
    if (Math.abs(zoom - 1) < 0.01) return;
    NovaMotion.spring({
      from: zoom, to: 1, springName: 'SOFT',
      onUpdate: (v) => { zoom = v; applySpace(); },
    });
  }

  /* ── maximize: transform-only, physics on toggle (docs/02 §4) ── */
  function maxGeometry(win) {
    const r = win.getBoundingClientRect();
    const cr = el.getBoundingClientRect();
    const left = parseFloat(win.style.left) || 0;
    const top = parseFloat(win.style.top) || 0;
    const k = Math.min((cr.width - 48) / Math.max(1, r.width), (cr.height - 150) / Math.max(1, r.height), 3);
    const dx = cr.width / 2 - (left + r.width / 2);
    const dy = (cr.height - 70) / 2 - (top + r.height / 2);
    return { dx, dy, k: Math.max(1, k) };
  }

  function toggleMax(win) {
    if (win.dataset.max === '1') unmaximize(win, true);
    else {
      const { dx, dy, k } = maxGeometry(win);
      win.dataset.max = '1';
      win.dataset.maxdx = String(dx);
      win.dataset.maxdy = String(dy);
      win.dataset.maxk = String(k);
      win.classList.add('win--max');
      ctx.emit?.('success');
      NovaMotion.spring({
        from: 0, to: 1, springName: 'HEAVY',
        onUpdate: (v) => {
          win.style.transform = `translate3d(${(dx * v).toFixed(1)}px, ${(dy * v).toFixed(1)}px, 0) scale(${(1 + (k - 1) * v).toFixed(4)})`;
        },
      });
    }
  }

  function unmaximize(win, animate) {
    if (win.dataset.max !== '1') return;
    const dx = Number(win.dataset.maxdx || 0);
    const dy = Number(win.dataset.maxdy || 0);
    const k = Number(win.dataset.maxk || 1);
    win.dataset.max = '0';
    win.classList.remove('win--max');
    const settle = (v) => {
      win.style.transform = v <= 0.01
        ? ''
        : `translate3d(${(dx * v).toFixed(1)}px, ${(dy * v).toFixed(1)}px, 0) scale(${(1 + (k - 1) * v).toFixed(4)})`;
    };
    if (animate) {
      ctx.emit?.('tick');
      NovaMotion.spring({ from: 1, to: 0, springName: 'HEAVY', onUpdate: settle, onDone: () => settle(0) });
    } else settle(0);
  }

  /* dblclick on the empty space = reset the zoom (not sweep) */
  el.addEventListener('dblclick', (e) => {
    if (e.target?.closest?.('.win')) return;
    resetZoom();
  });

  function sweep() {
    const els = Array.from(winEls.values());
    ctx.emit?.('sweep');
    els.forEach((w, i) => {
      setTimeout(() => {
        NovaMotion.spring({
          from: 0, to: -1, springName: 'SOFT',
          onUpdate: (v) => {
            w.style.transform = `translate3d(${(v * 40).toFixed(1)}px, ${(v * 620).toFixed(1)}px, 0) rotate(${(v * 7).toFixed(2)}deg) scale(${1 + v * 0.06})`;
            w.style.opacity = String(1 + v);
          },
        });
      }, i * NovaMotion.stagger(60));
    });
    setTimeout(() => {
      state.windows = [];
      notify('windows');
      render();
      ctx.onSwept?.();
    }, 460);
  }

  function enter() {
    render();
    el.style.pointerEvents = 'auto';
    el.style.opacity = '0';
    NovaMotion.spring({
      from: 0, to: 1, springName: 'SOFT',
      onUpdate: (v) => { el.style.opacity = String(v); },
    });
    Array.from(winEls.values()).forEach((w, i) => {
      w.style.opacity = '0';
      setTimeout(() => {
        NovaMotion.spring({
          from: 0, to: 1, springName: 'HEAVY',
          onUpdate: (v) => { w.style.opacity = String(v); },
        });
        NovaMotion.spring({
          from: 0.86, to: 1, springName: 'HEAVY',
          onUpdate: (v) => { w.style.transform = `scale(${v.toFixed(4)})`; },
        });
      }, i * NovaMotion.stagger(40));
    });
  }

  function setActive(v) {
    el.style.pointerEvents = v ? 'auto' : 'none';
    if (!v) el.style.opacity = '0';
  }

  el.dataset.zoom = '1.00';
  return {
    el, enter, render, sweep, winEl: (id) => winEls.get(id), space, setActive,
    getZoom: () => zoom,
    setZoom: (z) => { zoom = clamp(z, 0.6, 1.5); applySpace(); },
    maxWindow: (id) => { const w = winEls.get(id); if (w) toggleMax(w); },
    closeWindow: (id) => closeWindow(ctx, id),
  };
}
