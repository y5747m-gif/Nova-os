/* ══════════════════════════════════════════════════════════════
   Lock + Always-On (docs/01 §1)
   The clock is composed against the wallpaper, not pinned to the
   centre. Touch → the clock shifts, the tools appear.
   ══════════════════════════════════════════════════════════════ */

import { h, fmtTime, fmtDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import NovaMotion from '../motion/motion.js';
import { stagger as staggerMs } from '../motion/config.js';

export function mountLock(layer, ctx = {}) {
  const clock = h('div', { class: 'lock__clock' }, fmtTime());
  const date = h('div', { class: 'lock__date' }, fmtDate());
  const tools = h('div', { class: 'lock__tools' },
    h('span', { class: 't', dataset: { nodrag: '1' }, html: `${icon('actions', 'ico ico--sm')} اجتماع 20:05` }),
    h('span', { class: 't', dataset: { nodrag: '1' }, html: `${icon('music', 'ico ico--sm')} Aurora Drift` }),
    h('span', { class: 't', dataset: { nodrag: '1' }, html: `${icon('torch', 'ico ico--sm')} كشاف` }),
  );

  const el = h('div', { class: 'lock' },
    clock,
    date,
    h('div', { class: 'lock__rule' }),
    h('div', { class: 'lock__brand' }, 'N O V A'),
    tools,
    h('div', { class: 'lock__swipe' }, 'اسحب للأعلى ', h('b', {}, 'للدخول')),
  );
  layer.append(el);

  const aod = h('div', { class: 'aod hidden' },
    h('div', { class: 'aod__time' }, fmtTime()),
    h('div', { class: 'aod__row' }, h('span', {}, '72%'), h('span', {}, '▮')),
    h('div', { class: 'aod__line' }, h('span', { html: icon('chat', 'ico ico--sm') }), h('span', {}, 'رسالة جديدة من '), h('b', {}, 'محمد')),
    h('div', { class: 'aod__line', style: { opacity: '.7' } }, h('span', { html: icon('actions', 'ico ico--sm') }), h('span', {}, 'اجتماع الفريق — 20:05')),
  );
  layer.append(aod);

  let shift = null;

  function touched() {
    el.dataset.touched = '1';
    shift?.stop();
    shift = NovaMotion.spring({
      from: Number(clock.dataset.shift || 0), to: -7, springName: 'SOFT',
      onUpdate: (v) => { clock.dataset.shift = String(v); clock.style.transform = `translate3d(0, ${v.toFixed(1)}px, 0)`; },
    });
  }

  function progress(p) {
    const v = Math.max(0, Math.min(1, p));
    el.style.transform = `translate3d(0, ${(-v * 190).toFixed(1)}px, 0) scale(${(1 - v * 0.06).toFixed(4)})`;
    el.style.opacity = String(Math.max(0, 1 - v * 1.25));
  }

  function tick() {
    clock.textContent = fmtTime();
    date.textContent = fmtDate();
    aod.querySelector('.aod__time').textContent = fmtTime();
  }

  function aodVisible(v) {
    aod.classList.toggle('hidden', !v);
    el.classList.toggle('hidden', v);
  }

  function setVisible(v) { el.classList.toggle('hidden', !v); }

  return { el, aod, touched, progress, tick, aodVisible, setVisible, clock };
}
