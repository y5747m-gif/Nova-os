/* ══════════════════════════════════════════════════════════════
   The Notification Orb (docs/01 §7)
   An event never interrupts. It waits at the edge as an orb.
   Pull it → card. Tap the card → full app.
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import NovaMotion, { rectOf } from '../motion/motion.js';
import { draggable } from '../motion/gestures.js';

export function createOrb(layer, ctx = {}) {
  let orb = null;
  let card = null;
  let morph = null;
  let event = null;
  let pulse = null;

  function show(evt) {
    if (orb) dismiss('replaced');
    event = evt;
    orb = h('div', {
      class: 'orb',
      title: 'حدث جديد — اسحبني',
      dataset: { nodrag: '1', drag: 'orb' },
      html: `<span class="orb__pulse"></span><span>${icon(evt.icon, 'ico ico--sm')}</span>`,
      onclick: () => open('commit', 700),
    });
    orb.style.borderColor = `${evt.color}aa`;
    orb.style.background = `color-mix(in srgb, ${evt.color} 38%, var(--nv-elevated))`;
    layer.append(orb);

    // arrives with motion, pulses exactly once (200 ms, 4 %), then stops
    novaArrive();
    ctx.emit?.('orb');

    draggable(orb, {
      onMove: (_e, d) => {
        if (!card) buildCard();
        const travel = orb.getBoundingClientRect().width + 220;
        const p = Math.max(0, Math.min(1, -d.dx / travel * 1.6));
        morph.set(p);
        orb.style.opacity = String(1 - p * 0.7);
      },
      onEnd: (_e, d) => {
        if (!card) return;
        const p = morph.progress;
        const fast = -d.dx > 40;
        open(p > 0.42 || fast ? 'commit' : 'cancel', 900);
      },
    });
  }

  function novaArrive() {
    pulse?.stop();
    let stage = 0;
    pulse = NovaMotion.spring({
      from: 0.7, to: 1.04, springName: 'SNAP',
      onUpdate: (v) => { orb.style.transform = `scale(${v.toFixed(3)})`; },
      onDone: () => {
        stage++;
        if (stage === 1) {
          pulse = NovaMotion.spring({
            from: 1.04, to: 1, springName: 'SNAP',
            onUpdate: (v) => { orb.style.transform = `scale(${v.toFixed(2)})`; },
          });
        }
      },
    });
  }

  function buildCard() {
    card = h('div', { class: 'orb-card', dataset: { drag: 'orb-card' } },
      h('div', { class: 'orb-card__row' },
        h('span', { style: { color: event.color }, html: icon(event.icon, 'ico ico--sm') }),
        h('b', {}, event.who),
        h('small', {}, 'الآن'),
      ),
      h('p', {}, event.body),
      h('div', { class: 'orb-card__acts' },
        h('button', { 'data-primary': '1', dataset: { nodrag: '1' }, onclick: () => ctx.onPrimary?.(event) }, event.actions[0]),
        h('button', { dataset: { nodrag: '1' }, onclick: () => dismiss('deferred') }, 'لاحقًا'),
      ),
    );
    layer.append(card);
    const screen = layer.parentElement;
    const from = rectOf(orb, screen);
    const to = rectOf(card, screen);
    morph = NovaMotion.morph({
      el: card, from, to, radiusFrom: 21, radiusTo: 22,
      springName: 'SOFT', travel: 220,
      onProgress: (p) => { card.style.opacity = String(Math.min(1, p * 1.6)); },
      onDone: (dir) => { if (dir === 'cancel') dismiss('cancelled'); },
    });
  }

  function open(dir = 'commit', velocity = 0) {
    if (!card) buildCard();
    morph.release(dir, velocity);
    if (dir === 'commit') {
      orb.style.opacity = '0';
      ctx.emit?.('open');
    }
  }

  function dismiss(reason) {
    if (reason === 'deferred' && event) ctx.onDefer?.(event);
    orb?.remove();
    card?.remove();
    orb = null; card = null; morph = null; event = null;
    ctx.onDismiss?.(reason);
  }

  return { show, dismiss, get active() { return !!orb; }, get event() { return event; } };
}
