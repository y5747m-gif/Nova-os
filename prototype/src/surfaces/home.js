/* ══════════════════════════════════════════════════════════════
   Dynamic Space — the NOVA home surface (docs/01 §2)
   No icon grid: only what matters now. Cards are suggestions,
   not user-placed widgets.
   ══════════════════════════════════════════════════════════════ */

import { h, fmtDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS, appMeta, state } from '../core/store.js';
import NovaMotion, { lerp } from '../motion/motion.js';
import { stagger as staggerMs } from '../motion/config.js';

const RING = [
  { appId: 'whatsapp', angle: Math.PI * 1.15 },
  { appId: 'gallery',  angle: Math.PI * 1.5 },
  { appId: 'music',    angle: Math.PI * 1.85 },
];

function suggestions() {
  const hr = new Date().getHours();
  if (hr < 11) return ['notes', 'maps', 'whatsapp', 'browser'];
  if (hr < 17) return ['whatsapp', 'gallery', 'browser', 'notes'];
  return ['music', 'browser', 'whatsapp', 'gallery'];
}

export function mountHome(layer, ctx = {}) {
  const orbEls = new Map();
  const cardEls = new Map();

  const greet = h('div', { class: 'home__greet' },
    h('h2', {}, 'أهلاً ياسين'),
    h('p', { id: 'home-date' }, fmtDate()),
  );

  const task = h('button', {
    class: 'card home__task',
    onclick: () => ctx.onTask?.(),
  },
    h('span', { html: icon('actions', 'ico') }),
    h('span', { class: 't' },
      h('b', {}, 'المهمة القادمة'),
      h('span', {}, 'اجتماع الفريق — 25 دقيقة'),
    ),
    h('span', { class: 'badge' }, 'قريبًا'),
  );

  const ringLine = h('div', { class: 'ring-line' });
  const ring = h('div', { class: 'home__ring' }, ringLine);

  const cards = h('div', { class: 'home__cards' });

  const root = h('div', { class: 'home' },
    greet,
    task,
    h('div', { class: 'home__section-title' }, 'المساحة الحالية'),
    ring,
    cards,
    h('div', { class: 'home__foot' },
      h('div', { class: 'home__pill' }),
      h('small', {}, 'اسحب للأعلى · NOVA CORE'),
    ),
  );

  layer.append(root);

  /* ── context ring ─────────────────────────────────────────── */
  const ringApps = () => (state.lastWorkspace?.length ? state.lastWorkspace : RING.map((r) => r.appId)).slice(0, 3);

  function buildRing() {
    for (const el of orbEls.values()) el.remove();
    orbEls.clear();
    const ids = ringApps();
    ids.forEach((appId, i) => {
      const meta = appMeta(appId);
      const el = h('button', {
        class: 'orb-item',
        title: meta.name,
        dataset: { app: appId },
        onclick: (e) => ctx.onOpenApp?.(appId, el),
      }, h('span', { html: icon(meta.icon, 'ico') }), h('span', { class: 'label' }, meta.name));
      el.style.color = meta.color;
      ring.append(el);
      orbEls.set(appId, el);
      // anchored at the ring centre → offsets are relative
      const a = RING[i % RING.length].angle;
      el.style.transform = `translate3d(${(Math.cos(a) * 58).toFixed(1)}px, ${(Math.sin(a) * 58).toFixed(1)}px, 0)`;
    });
  }

  function animateRing() {
    const ids = ringApps();
    const items = ids.map((id) => orbEls.get(id)).filter(Boolean);
    const orb = NovaMotion.orbital({
      items,
      // orbs are anchored at the ring centre via left/top:50%, so the orbital
      // offsets are relative to that point — origin (0,0), not absolute px.
      center: { x: 0, y: 0 },
      radius: 58,
      stagger: staggerMs(70),
      angleOf: (_item, i) => RING[i % RING.length].angle,
      onUpdate: (el, _i, s) => {
        el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) scale(${s.scale.toFixed(3)})`;
        el.style.opacity = s.alpha.toFixed(2);
      },
    });
    orb.release('commit', 900);
  }

  /* ── suggestion cards ─────────────────────────────────────── */
  function buildCards() {
    cards.replaceChildren();
    cardEls.clear();
    const ids = suggestions();
    ids.forEach((appId) => {
      const meta = appMeta(appId);
      const el = h('button', {
        class: 'card app-card',
        dataset: { app: appId },
        onclick: () => ctx.onOpenApp?.(appId, el),
      },
        h('span', { class: 'ico-wrap', html: icon(meta.icon, 'ico') }),
        h('span', { class: 'meta' }, h('b', {}, meta.name), h('span', {}, meta.sub)),
        h('span', { class: 'go', html: icon('chevron', 'ico ico--sm') }),
      );
      el.style.setProperty('--nv-accent', meta.color);
      cards.append(el);
      cardEls.set(appId, el);
    });
  }

  function animateCards() {
    const els = Array.from(cardEls.values());
    els.forEach((el, i) => {
      const from = 26;
      el.style.opacity = '0';
      setTimeout(() => {
        NovaMotion.spring({
          from, to: 0, springName: 'ELASTIC',
          onUpdate: (v) => { el.style.transform = `translate3d(0, ${v.toFixed(2)}px, 0)`; },
        });
        NovaMotion.spring({
          from: 0, to: 1, springName: 'SOFT',
          onUpdate: (v) => { el.style.opacity = String(v); },
        });
      }, i * staggerMs(24));
    });
  }

  function refresh() {
    const d = root.querySelector('#home-date');
    if (d) d.textContent = fmtDate();
    buildRing();
    buildCards();
  }

  function enter() {
    refresh();
    animateRing();
    animateCards();
  }

  buildRing();
  buildCards();

  return {
    root,
    enter,
    refresh,
    cardEl: (appId) => cardEls.get(appId),
    anyCardRect: () => (cardEls.values().next().value || root).getBoundingClientRect(),
    ringEl: (appId) => orbEls.get(appId),
    setHidden: (v) => { root.dataset.hidden = v ? '1' : '0'; },
  };
}
