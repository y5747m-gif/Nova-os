/* ══════════════════════════════════════════════════════════════
   Split Flow (docs/01 §13)
   No fixed half-screen: you drag an app onto another one. The
   divider is interactive with snap points (25 / 50 / 75).
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appMeta } from '../core/store.js';
import { contentFor } from './app.js';
import NovaMotion from '../motion/motion.js';
import { draggable } from '../motion/gestures.js';

const SNAPS = [25, 50, 75];

export function buildSplit({ host, guest, ratio = 50, ctx = {} }) {
  const hostMeta = appMeta(host), guestMeta = appMeta(guest);

  const hostPane = h('div', { class: 'split__pane' },
    h('div', { class: 'split__label' }, `${hostMeta.name} · المضيف`),
    contentFor(host, { seed: 1 }),
  );
  const guestPane = h('div', { class: 'split__pane' },
    h('div', { class: 'split__label' }, `${guestMeta.name} · ضيف`),
    contentFor(guest, { seed: 5 }),
  );
  const divider = h('div', { class: 'split__divider', dataset: { nodrag: '1', drag: 'divider' } }, h('i'));

  const el = h('div', { class: 'split', dataset: { host, guest } }, hostPane, divider, guestPane);

  let r = ratio;
  function apply(next, animate = false) {
    r = Math.max(14, Math.min(86, next));
    hostPane.style.flexBasis = `${r}%`;
    guestPane.style.flexBasis = `${100 - r}%`;
    ctx.onRatio?.(r);
  }
  apply(ratio);

  let lastSnap = null;
  draggable(divider, {
    engage: 2,
    onStart: () => { divider.dataset.active = '1'; },
    onMove: (e, d) => {
      const box = el.getBoundingClientRect();
      const p = ((e.clientY - box.top) / box.height) * 100;
      apply(p);
      const near = SNAPS.find((s) => Math.abs(s - p) < 2.4);
      if (near !== undefined && near !== lastSnap) {
        lastSnap = near;
        divider.style.background = 'color-mix(in srgb, var(--nv-accent) 26%, transparent)';
        ctx.emit?.('tick');
      } else if (near === undefined) {
        lastSnap = null;
        divider.style.background = '';
      }
    },
    onEnd: () => {
      delete divider.dataset.active;
      const target = r < 20 ? 14 : SNAPS.reduce((best, s) => (Math.abs(s - r) < Math.abs(best - r) ? s : best), SNAPS[0]);
      NovaMotion.spring({
        from: r, to: target, springName: 'SOFT',
        onUpdate: (v) => apply(v),
        onDone: () => {
          if (r < 20) ctx.onCollapseGuest?.();
          else ctx.emit?.('tick');
        },
      });
    },
  });

  return { el, apply, get ratio() { return r; }, hostPane, guestPane, divider };
}
