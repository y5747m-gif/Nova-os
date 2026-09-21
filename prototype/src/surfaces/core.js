/* ══════════════════════════════════════════════════════════════
   NOVA CORE — the system centre (docs/01 §5, §11)
   Swipe up from the bottom. Orbital launchpad + everything search.
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS, CONTACTS, appMeta } from '../core/store.js';
import NovaMotion from '../motion/motion.js';
import { stagger as staggerMs } from '../motion/config.js';
import { draggable } from '../motion/gestures.js';

const ORBIT_ITEMS = [
  { id: 'search', label: 'بحث', icon: 'search' },
  { id: 'apps', label: 'تطبيقات', icon: 'apps' },
  { id: 'people', label: 'أشخاص', icon: 'people' },
  { id: 'files', label: 'ملفات', icon: 'files' },
  { id: 'canvas', label: 'المساحة', icon: 'layers' },
];

export function mountCore(layer, ctx = {}) {
  const results = h('div', { class: 'core__results hidden' });
  const input = h('input', {
    type: 'search',
    placeholder: 'ابحث في كل حاجة: محمد، صور، ملفات، أحداث…',
    'aria-label': 'NOVA FIND',
    oninput: () => runSearch(input.value.trim()),
    onkeydown: (e) => { if (e.key === 'Escape') input.blur(); },
  });
  const search = h('div', { class: 'core__search' }, h('span', { html: icon('search', 'ico ico--sm') }), input);

  const orbit = h('div', { class: 'core__orbit' });
  const hub = h('button', { class: 'hub', dataset: { nodrag: '1' }, onclick: () => ctx.onCanvas?.() }, 'NOVA');
  orbit.append(h('div', { class: 'ring-line' }), hub);
  const orbEls = [];
  ORBIT_ITEMS.forEach((it) => {
    const el = h('button', {
      class: 'orb-item',
      dataset: { nodrag: '1' },
      title: it.label,
      onclick: () => {
        if (it.id === 'canvas') ctx.onCanvas?.();
        else if (it.id === 'search') input.focus();
        else { runSearch(it.label === 'أشخاص' ? 'محمد' : it.label); input.focus(); }
      },
    }, h('span', { html: icon(it.icon, 'ico') }), h('span', { class: 'label' }, it.label));
    orbit.append(el);
    orbEls.push(el);
  });

  const tiles = h('div', { class: 'core__row' });
  const TILE_APPS = ['whatsapp', 'gallery', 'music', 'notes', 'browser', 'maps'];
  const tileEls = new Map();
  TILE_APPS.forEach((appId) => {
    const meta = appMeta(appId);
    const el = h('button', {
      class: 'app-tile',
      dataset: { app: appId, drag: 'app-tile' },
      onclick: () => ctx.onOpenApp?.(appId, el),
    }, h('span', { class: 'ico-wrap', html: icon(meta.icon, 'ico ico--sm') }), h('span', {}, meta.name));
    tiles.append(el);
    tileEls.set(appId, el);

    // dragging an app out of CORE builds a Split Flow (docs/01 §13)
    draggable(el, {
      onStart: () => ctx.onTileDragStart?.(appId, el),
      onMove: (e, d) => ctx.onTileDragMove?.(appId, el, d, e),
      onEnd: (e, d) => ctx.onTileDragEnd?.(appId, el, d, e),
    });
  });

  const el = h('div', { class: 'panel panel--core' },
    h('div', { class: 'panel__grip' }, h('i')),
    h('div', { class: 'core' },
      search,
      results,
      orbit,
      h('div', { class: 'home__section-title', style: { margin: '2px 2px 0' } }, 'تطبيقات'),
      tiles,
    ),
  );

  el.style.transform = 'translate3d(0, 100%, 0)';
  el.style.opacity = '0';
  layer.append(el);

  function runSearch(q) {
    if (!q) { results.classList.add('hidden'); results.replaceChildren(); return; }
    const found = [];
    for (const app of Object.values(APPS)) {
      if (app.name.includes(q) || q.includes(app.name)) found.push({ icon: app.icon, color: app.color, title: app.name, sub: 'تطبيق', app: app.id });
    }
    if ('محمد'.includes(q) || q.includes('محمد')) {
      found.unshift(
        { icon: 'chat', color: '#34d399', title: 'محادثة محمد', sub: 'رسائل', app: 'whatsapp' },
        { icon: 'phone', color: '#7dd3fc', title: 'محمد — اتصال', sub: 'جهات', app: 'whatsapp' },
        { icon: 'gallery', color: '#ff6b9a', title: 'صور محمد', sub: '12 صورة', app: 'gallery' },
      );
    }
    found.push({ icon: 'files', color: '#f5a524', title: `ملفات فيها «${q}»`, sub: 'الملفات', app: 'notes' });
    found.push({ icon: 'actions', color: '#6c5ce7', title: `إجراء: إرسال «${q}»`, sub: 'NOVA INTELLIGENCE', app: null });

    results.classList.remove('hidden');
    results.replaceChildren(...found.slice(0, 6).map((r) => h('button', {
      class: 'core__result',
      style: { width: '100%', textAlign: 'initial' },
      dataset: { nodrag: '1' },
      onclick: () => { if (r.app) ctx.onOpenApp?.(r.app, el); else ctx.toast?.(`جاهز لتنفيذ: إرسال «${q}»`); },
    }, h('span', { style: { color: r.color }, html: icon(r.icon, 'ico ico--sm') }), h('span', {}, r.title), h('small', {}, r.sub))));
  }

  function animateOrbit(dir = 'commit', velocity = 900) {
    const orb = NovaMotion.orbital({
      items: orbEls,
      // items are anchored at the orbit centre, so offsets start at (0,0)
      center: { x: 0, y: 0 },
      radius: 74,
      stagger: staggerMs(46),
      angleOf: (_item, i) => Math.PI * (1.08 + (i / (ORBIT_ITEMS.length - 1)) * 0.84),
      onUpdate: (item, _i, s) => {
        item.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) scale(${s.scale.toFixed(3)})`;
        item.style.opacity = s.alpha.toFixed(2);
      },
    });
    orb.release(dir, velocity);
  }

  return { el, input, runSearch, animateOrbit, tileEl: (id) => tileEls.get(id), tiles };
}
