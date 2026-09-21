/* ══════════════════════════════════════════════════════════════
   NOVA FLOW — events, not notifications (docs/01 §6)
   Cards arrive live, stack by priority, and are deferred (not
   destroyed) when swiped away.
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, deferEvent } from '../core/store.js';
import NovaMotion from '../motion/motion.js';
import { stagger as staggerMs } from '../motion/config.js';
import { draggable } from '../motion/gestures.js';

export function mountFlow(layer, ctx = {}) {
  const list = h('div', { class: 'flow__list' });
  const head = h('div', { class: 'flow__head' },
    h('b', {}, 'NOVA FLOW'),
    h('span', {}, 'مركز الأحداث — مفيش إشعارات بتقطعك'),
  );
  const quiet = h('p', { class: 'flow__quiet' }, 'تم تجميع 6 عروض في مجموعة هادئة · تُفتح عند الطلب');

  const el = h('div', { class: 'panel panel--flow' },
    h('div', { class: 'panel__grip' }, h('i')),
    h('div', { class: 'flow' }, head, list, quiet),
  );
  el.style.transform = 'translate3d(0, -110%, 0)';
  el.style.opacity = '0';
  layer.append(el);

  function cardFor(evt) {
    const card = h('div', { class: 'event-card', dataset: { drag: 'event' } },
      h('div', { class: 'event-card__top' },
        h('span', { style: { color: evt.color }, html: icon(evt.icon, 'ico ico--sm') }),
        h('span', { class: 'who' }, evt.who),
        h('small', {}, 'الآن'),
      ),
      h('div', { class: 'event-card__body' }, evt.body),
      h('div', { class: 'event-card__acts' },
        ...evt.actions.map((a, i) => h('button', {
          'data-primary': i === 0 ? '1' : '0',
          onclick: () => (i === 0 ? ctx.onPrimary?.(evt) : ctx.onSecondary?.(evt)),
        }, a)),
      ),
    );

    // swipe away = deferral, never destruction
    draggable(card, {
      onMove: (_e, d) => {
        card.style.transform = `translate3d(0, ${(d.dy * 0.35).toFixed(1)}px, 0) scale(${(1 - Math.min(.04, Math.abs(d.dy) / 2400)).toFixed(3)})`;
        card.style.opacity = String(Math.max(.4, 1 - Math.abs(d.dy) / 260));
      },
      onEnd: (_e, d) => {
        const away = Math.abs(d.dy) > 64;
        NovaMotion.spring({
          from: d.dy * 0.35, to: away ? -120 : 0, springName: 'SOFT',
          onUpdate: (v) => { card.style.transform = `translate3d(0, ${v.toFixed(1)}px, 0)`; },
        });
        if (away) {
          card.dataset.deferred = '1';
          deferEvent(evt.id);
          ctx.emit?.('defer');
          ctx.toast?.('تم تأجيل الحدث — هيرجع في سياقه');
        } else {
          card.style.opacity = '1';
        }
      },
    });
    return card;
  }

  function render() {
    const evts = state.events;
    list.replaceChildren(...(evts.length
      ? evts.map(cardFor)
      : [h('p', { class: 'flow__quiet' }, 'مفيش أحداث الآن — النظام هادي.')]));

    list.querySelectorAll('.event-card').forEach((c, i) => {
      c.style.opacity = '0';
      setTimeout(() => {
        NovaMotion.spring({ from: 22, to: 2, springName: 'ELASTIC', onUpdate: (v) => { c.style.transform = `translate3d(0, ${v}px, 0)`; } });
        NovaMotion.spring({ from: 0, to: 1, springName: 'SOFT', onUpdate: (v) => { c.style.opacity = String(v); } });
      }, i * staggerMs(40));
    });
  }

  return { el, render, list };
}
