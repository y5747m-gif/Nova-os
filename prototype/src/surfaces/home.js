/* ══════════════════════════════════════════════════════════════
   Dynamic Space — the NOVA home surface (docs/01 §2)
   No icon grid: only what matters now. A living clock, a greeting that
   knows the time of day, the context ring and suggestion cards that are
   REAL apps inside the APK (usage-ranked) and the demo set in a browser.
   ══════════════════════════════════════════════════════════════ */

import { h, fmtDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS, appMeta, state } from '../core/store.js';
import NovaMotion, { clamp } from '../motion/motion.js';
import { stagger as staggerMs } from '../motion/config.js';
import {
  isNativeLauncher, realApps, realAppIcon, realAppLabel, topRealApps,
  launcherState, requestDefaultLauncher, liveNotifications,
} from '../core/launcher.js';

const RING = [
  { appId: 'whatsapp', angle: Math.PI * 1.15 },
  { appId: 'gallery', angle: Math.PI * 1.5 },
  { appId: 'music', angle: Math.PI * 1.85 },
];

function demoSuggestions() {
  const hr = new Date().getHours();
  if (hr < 11) return ['notes', 'maps', 'whatsapp', 'browser'];
  if (hr < 17) return ['whatsapp', 'gallery', 'browser', 'notes'];
  return ['music', 'browser', 'whatsapp', 'gallery'];
}

/** The four cards that matter right now — real packages in the APK. */
function suggestions() {
  if (isNativeLauncher()) {
    const top = topRealApps(8);
    const all = realApps();
    const ids = [];
    for (const p of top) if (!ids.includes(p)) ids.push(p);
    for (const a of all) {
      if (ids.length >= 4) break;
      if (!ids.includes(a.p)) ids.push(a.p);
    }
    if (ids.length) return ids.slice(0, 4);
  }
  return demoSuggestions();
}

function ringIds() {
  if (state.lastWorkspace?.length) return state.lastWorkspace.slice(0, 3);
  if (isNativeLauncher()) {
    const top = topRealApps(6);
    if (top.length >= 3) return top.slice(0, 3);
    const all = realApps().map((a) => a.p);
    if (all.length >= 3) return all.slice(0, 3);
    if (all.length) return all;
  }
  return RING.map((r) => r.appId);
}

function metaFor(id) {
  if (APPS[id]) return appMeta(id);
  // a real installed package
  return { id, name: realAppLabel(id), sub: 'تطبيق', icon: 'apps', color: '#6c5ce7', real: true };
}

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'ليلة هادئة';
  if (hr < 12) return 'صباح الخير';
  if (hr < 17) return 'يوم سعيد';
  if (hr < 21) return 'مساء الخير';
  return 'مساء هادئ';
}

/* the real state of NOVA FLOW — the phone's actual live events */
function flowSummary() {
  try {
    const n = liveNotifications().length;
    if (n) return `${n} ${n === 1 ? 'حدث جديد بانتظارك' : 'أحداث جديدة بانتظارك'}`;
  } catch { /* ignore */ }
  return 'كل شيء هادئ — لا أحداث الآن';
}

function clockText(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function mountHome(layer, ctx = {}) {
  const orbEls = new Map();
  const cardEls = new Map();
  let tiltBound = false;

  const clockEl = h('div', { class: 'home__clock' }, clockText());
  const greet = h('div', { class: 'home__greet' },
    clockEl,
    h('h2', { id: 'home-greet' }, greeting()),
    h('p', { id: 'home-date' }, fmtDate()),
  );

  /* the FLOW card mirrors the phone's REAL events inside the APK */
  const native = isNativeLauncher();
  const taskSub = h('span', {}, native ? flowSummary() : 'اجتماع الفريق — 25 دقيقة');
  const taskBadge = h('span', { class: 'badge' }, native ? String(liveNotifications().length || 'هادئ') : 'قريبًا');
  const task = h('button', {
    class: 'card home__task',
    onclick: (e) => { ripple(e); ctx.onTask?.(); },
  },
    h('span', { html: icon('actions', 'ico') }),
    h('span', { class: 't' },
      h('b', {}, native ? 'NOVA FLOW' : 'المهمة القادمة'),
      taskSub,
    ),
    taskBadge,
  );

  /* one-tap path to becoming the phone's actual home — the chip that
     turns "an app you opened" into "the interface the phone boots to" */
  const banner = h('button', {
    class: 'home__banner hidden',
    onclick: (e) => { ripple(e); requestDefaultLauncher(); ctx.toast?.('اختر NOVA من قائمة النظام'); },
  },
    h('span', { class: 'home__banner-ico', html: icon('layers', 'ico') }),
    h('span', { class: 't' },
      h('b', {}, 'اجعل NOVA واجهتك الأساسية'),
      h('span', {}, 'اضغط لتعيينها الشاشة الرئيسية الافتراضية — زر الهوم يفتحها دائمًا'),
    ),
    h('span', { class: 'go', html: icon('chevron', 'ico ico--sm') }),
  );

  const ringLine = h('div', { class: 'ring-line' });
  const ring = h('div', { class: 'home__ring' }, ringLine);

  const cards = h('div', { class: 'home__cards' });

  const root = h('div', { class: 'home' },
    greet,
    task,
    banner,
    h('div', { class: 'home__section-title' }, isNativeLauncher() ? 'مقترح لك الآن' : 'المساحة الحالية'),
    ring,
    cards,
    h('div', { class: 'home__foot' },
      h('div', { class: 'home__pill' }),
      h('small', {}, 'اسحب للأعلى · NOVA CORE'),
    ),
  );

  layer.append(root);

  /* live clock + the real state of the interface */
  try {
    setInterval(() => {
      clockEl.textContent = clockText();
      const d = root.querySelector('#home-date');
      if (d) d.textContent = fmtDate();
      const h2 = greet.querySelector('h2');
      if (h2) h2.textContent = greeting();
      paintLive();
    }, 15000);
    window.addEventListener('nova:launcher', paintLive);
    window.addEventListener('nova:live', paintLive);
  } catch { /* ignore */ }

  /* FLOW card + default-home chip reflect reality on every visit */
  function paintLive() {
    try {
      taskSub.textContent = native ? flowSummary() : taskSub.textContent;
      const n = native ? liveNotifications().length : 0;
      if (native) taskBadge.textContent = n ? String(n) : 'هادئ';
      const s = native ? launcherState() : null;
      banner.classList.toggle('hidden', !(s && !s.def));
    } catch { /* ignore */ }
  }

  /* tap ripple — pure CSS keyframes, cleaned on animation end */
  function ripple(e) {
    try {
      const host = e?.currentTarget;
      if (!host || !host.getBoundingClientRect) return;
      const r = host.getBoundingClientRect();
      const s = h('span', { class: 'ripple' });
      const size = Math.max(r.width, r.height) * 1.1;
      s.style.width = `${size}px`;
      s.style.height = `${size}px`;
      const x = (e.clientX ?? r.left + r.width / 2) - r.left - size / 2;
      const y = (e.clientY ?? r.top + r.height / 2) - r.top - size / 2;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.addEventListener('animationend', () => s.remove());
      host.append(s);
    } catch { /* ignore */ }
  }

  /* 3D tilt — the card leans toward the finger (direct writes, no loop) */
  function bindTilt(elm) {
    if (tiltBound) return;
    tiltBound = true;
    let active = null;
    const max = 7;
    cards.addEventListener('pointermove', (e) => {
      const card = e.target?.closest?.('.app-card');
      if (!card) return;
      active = card;
      try {
        if (document.body?.dataset?.motion === 'reduced') return;
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * -2 * max;
        const ry = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2 * max;
        card.style.transform = `perspective(600px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translate3d(0, -2px, 0)`;
      } catch { /* ignore */ }
    });
    cards.addEventListener('pointerleave', () => {
      if (!active) return;
      const card = active;
      active = null;
      NovaMotion.spring({
        from: 1, to: 0, springName: 'SOFT',
        onUpdate: (v) => {
          card.style.transform = v <= 0.01 ? '' : `perspective(600px) translate3d(0, ${(-2 * v).toFixed(2)}px, 0) scale(${(1 + v * 0.008).toFixed(4)})`;
        },
      });
    });
    void elm;
  }

  /* ── context ring ─────────────────────────────────────────── */

  function buildRing() {
    for (const el of orbEls.values()) el.remove();
    orbEls.clear();
    const ids = ringIds();
    ids.forEach((appId, i) => {
      const meta = metaFor(appId);
      const face = meta.real
        ? h('img', { class: 'orb-img', src: realAppIcon(appId), alt: meta.name, draggable: 'false' })
        : h('span', { html: icon(meta.icon, 'ico') });
      const el = h('button', {
        class: meta.real ? 'orb-item orb-item--real' : 'orb-item',
        title: meta.name,
        dataset: { app: appId },
        onclick: (e) => { ripple(e); ctx.onOpenApp?.(appId, el); },
      }, face, h('span', { class: 'label' }, meta.name));
      el.style.color = meta.color;
      ring.append(el);
      orbEls.set(appId, el);
      const a = RING[i % RING.length].angle;
      el.style.transform = `translate3d(${(Math.cos(a) * 58).toFixed(1)}px, ${(Math.sin(a) * 58).toFixed(1)}px, 0)`;
    });
  }

  function animateRing() {
    const ids = ringIds();
    const items = ids.map((id) => orbEls.get(id)).filter(Boolean);
    const orb = NovaMotion.orbital({
      items,
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
      const meta = metaFor(appId);
      const face = meta.real
        ? h('img', { class: 'app-card__icon', src: realAppIcon(appId), alt: meta.name, draggable: 'false' })
        : h('span', { class: 'ico-wrap', html: icon(meta.icon, 'ico') });
      const el = h('button', {
        class: meta.real ? 'card app-card app-card--real' : 'card app-card',
        dataset: { app: appId },
        onclick: (e) => { ripple(e); ctx.onOpenApp?.(appId, el); },
      },
        face,
        h('span', { class: 'meta' }, h('b', {}, meta.name), h('span', {}, meta.sub)),
        h('span', { class: 'go', html: icon('chevron', 'ico ico--sm') }),
      );
      el.style.setProperty('--nv-accent', meta.color);
      cards.append(el);
      cardEls.set(appId, el);
    });
    bindTilt();
  }

  function animateCards() {
    const els = Array.from(cardEls.values());
    const c = NovaMotion.cascade({
      items: els,
      stagger: staggerMs(46),
      span: 520,
      springName: 'ELASTIC',
      onUpdate: (el, _i, p) => {
        el.style.opacity = String(clamp(p * 1.5));
        el.style.transform = `translate3d(0, ${((1 - p) * 30).toFixed(2)}px, 0) scale(${(0.94 + 0.06 * p).toFixed(4)})`;
      },
    });
    c.release('commit', 800);
    // the task card joins the same wave, slightly earlier
    NovaMotion.spring({
      from: 18, to: 0, springName: 'ELASTIC',
      onUpdate: (v) => { task.style.transform = `translate3d(0, ${v.toFixed(2)}px, 0)`; },
    });
  }

  function refresh() {
    const d = root.querySelector('#home-date');
    if (d) d.textContent = fmtDate();
    clockEl.textContent = clockText();
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
  paintLive();

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
