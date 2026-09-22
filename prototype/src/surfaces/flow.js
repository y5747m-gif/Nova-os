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
import {
  isNativeLauncher, liveNotifications, openNotification, dismissNotification,
  realAppIcon, launcherState, openNotificationAccess,
} from '../core/launcher.js';

export function mountFlow(layer, ctx = {}) {
  const list = h('div', { class: 'flow__list' });
  const head = h('div', { class: 'flow__head' },
    h('b', {}, 'NOVA FLOW'),
    h('span', {}, 'مركز الأحداث — مفيش إشعارات بتقطعك'),
  );
  const liveTag = h('span', { class: 'flow__live hidden' }, '● مباشر');
  head.append(liveTag);
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

  /* a live system notification, mirrored as a FLOW card */
  function liveCardFor(n) {
    const card = h('div', { class: 'event-card event-card--live', dataset: { drag: 'event' } },
      h('div', { class: 'event-card__top' },
        h('img', { class: 'event-card__icon', src: realAppIcon(n.pkg), alt: n.app, draggable: 'false' }),
        h('span', { class: 'who' }, n.title || n.app),
        h('small', {}, n.app || ''),
      ),
      h('div', { class: 'event-card__body' }, n.text || ''),
      h('div', { class: 'event-card__acts' },
        h('button', { 'data-primary': '1', onclick: () => { openNotification(n.key); ctx.toast?.(`فتح ${n.app}`); } }, 'فتح'),
        h('button', {
          onclick: () => {
            dismissNotification(n.key);
            card.dataset.deferred = '1';
            NovaMotion.spring({
              from: 0, to: -90, springName: 'SOFT',
              onUpdate: (v) => { card.style.transform = `translate3d(0, ${v.toFixed(1)}px, 0)`; },
              onDone: () => render(),
            });
          },
        }, 'تجاهل'),
      ),
    );
    draggable(card, {
      onMove: (_e, d) => {
        card.style.transform = `translate3d(0, ${(d.dy * 0.35).toFixed(1)}px, 0)`;
        card.style.opacity = String(Math.max(.4, 1 - Math.abs(d.dy) / 260));
      },
      onEnd: (_e, d) => {
        if (Math.abs(d.dy) > 64) {
          dismissNotification(n.key);
          NovaMotion.spring({
            from: d.dy * 0.35, to: -120, springName: 'SOFT',
            onUpdate: (v) => { card.style.transform = `translate3d(0, ${v.toFixed(1)}px, 0)`; },
            onDone: () => render(),
          });
          ctx.emit?.('defer');
        } else {
          NovaMotion.spring({
            from: d.dy * 0.35, to: 0, springName: 'SOFT',
            onUpdate: (v) => { card.style.transform = `translate3d(0, ${v.toFixed(1)}px, 0)`; },
          });
          card.style.opacity = '1';
        }
      },
    });
    return card;
  }

  function render() {
    const evts = state.events;
    const live = isNativeLauncher() ? liveNotifications() : [];
    liveTag.classList.toggle('hidden', !live.length);

    const kids = [];
    if (live.length) {
      kids.push(h('div', { class: 'home__section-title' }, `إشعارات حية · ${live.length}`));
      for (const n of live.slice(0, 10)) kids.push(liveCardFor(n));
    }
    if (evts.length) {
      if (live.length) kids.push(h('div', { class: 'home__section-title' }, 'أحداث NOVA'));
      for (const e of evts) kids.push(cardFor(e));
    }
    if (!kids.length) {
      const st = isNativeLauncher() ? launcherState() : { notif: true };
      kids.push(st.notif === false
        ? h('button', {
          class: 'card flow__enable',
          onclick: () => { openNotificationAccess(); ctx.toast?.('فعّل وصول الإشعارات لـ NOVA'); },
        },
          h('span', { html: icon('actions', 'ico') }),
          h('span', { class: 'meta' }, h('b', {}, 'فعّل الأحداث الحية'), h('span', {}, 'اعرض إشعارات هاتفك هنا كبطاقات هادئة')))
        : h('p', { class: 'flow__quiet' }, 'مفيش أحداث الآن — النظام هادي.'));
    }

    list.replaceChildren(...kids);

    // cards arrive as one physics wave — no timers, fully scrubbable
    const cards = Array.from(list.querySelectorAll('.event-card'));
    cards.forEach((c) => { c.style.opacity = '0'; });
    if (cards.length) {
      const c = NovaMotion.cascade({
        items: cards,
        stagger: staggerMs(48),
        span: 560,
        springName: 'ELASTIC',
        onUpdate: (node, _i, p) => {
          node.style.opacity = String(Math.min(1, p * 1.6));
          node.style.transform = `translate3d(0, ${((1 - p) * 26 + 2 * p).toFixed(2)}px, 0) scale(${(.95 + .05 * p).toFixed(4)})`;
        },
      });
      c.release('commit', 850);
    }
  }

  try {
    window.addEventListener('nova:live', () => {
      if (state.panel === 'flow') render();
    });
  } catch { /* ignore */ }

  return { el, render, list };
}
