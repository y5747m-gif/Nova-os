/* ══════════════════════════════════════════════════════════════
   NOVA CORE — the system centre (docs/01 §5, §11)
   Swipe up from the bottom. Orbital launchpad + NOVA FIND.
   Inside the APK the tiles are REAL installed apps (usage-ranked),
   search covers apps + contacts + actions, and long-press reveals
   deep shortcuts — like a flagship launcher.
   ══════════════════════════════════════════════════════════════ */

import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS, CONTACTS, appMeta } from '../core/store.js';
import NovaMotion from '../motion/motion.js';
import { stagger as staggerMs } from '../motion/config.js';
import { draggable } from '../motion/gestures.js';
import {
  isNativeLauncher, realApps, realAppIcon, realAppLabel, topRealApps,
  searchRealContacts, dialNumber, realShortcuts, launchRealShortcut,
  openRealAppInfo, uninstallRealApp,
} from '../core/launcher.js';

const ORBIT_ITEMS = [
  { id: 'search', label: 'بحث', icon: 'search' },
  { id: 'apps', label: 'تطبيقات', icon: 'apps' },
  { id: 'people', label: 'أشخاص', icon: 'people' },
  { id: 'files', label: 'ملفات', icon: 'files' },
  { id: 'canvas', label: 'المساحة', icon: 'layers' },
];

const DEMO_TILES = ['whatsapp', 'gallery', 'music', 'notes', 'browser', 'maps'];

function tileIds() {
  if (!isNativeLauncher()) return DEMO_TILES;
  const ids = [];
  for (const p of topRealApps(12)) if (!ids.includes(p)) ids.push(p);
  for (const a of realApps()) {
    if (ids.length >= 12) break;
    if (!ids.includes(a.p)) ids.push(a.p);
  }
  return ids.length ? ids : DEMO_TILES;
}

export function mountCore(layer, ctx = {}) {
  const results = h('div', { class: 'core__results hidden' });
  const input = h('input', {
    type: 'search',
    placeholder: 'ابحث في كل حاجة: تطبيقات، أشخاص، إجراءات…',
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
        else if (it.id === 'apps') { input.value = ''; runSearch(''); showAll(); }
        else { runSearch(it.id === 'people' ? 'محمد' : it.label); input.focus(); }
      },
    }, h('span', { html: icon(it.icon, 'ico') }), h('span', { class: 'label' }, it.label));
    orbit.append(el);
    orbEls.push(el);
  });

  const tiles = h('div', { class: 'core__row' });
  const tileEls = new Map();
  const count = h('div', { class: 'home__section-title', style: { margin: '2px 2px 0' } }, 'تطبيقات');

  function faceFor(appId) {
    const meta = APPS[appId] ? appMeta(appId) : null;
    if (meta) return { html: h('span', { class: 'ico-wrap', html: icon(meta.icon, 'ico ico--sm') }), name: meta.name, color: meta.color };
    return {
      html: h('img', { class: 'tile-img', src: realAppIcon(appId), alt: realAppLabel(appId), draggable: 'false' }),
      name: realAppLabel(appId),
      color: '#6c5ce7',
    };
  }

  function buildTiles() {
    tiles.replaceChildren();
    tileEls.clear();
    const ids = tileIds();
    count.textContent = isNativeLauncher() ? `تطبيقات · ${realApps().length || ids.length}` : 'تطبيقات';
    ids.forEach((appId) => {
      const face = faceFor(appId);
      const el = h('button', {
        class: 'app-tile',
        dataset: { app: appId, drag: 'app-tile' },
        onclick: () => ctx.onOpenApp?.(appId, el),
      }, face.html, h('span', {}, face.name));
      tiles.append(el);
      tileEls.set(appId, el);

      // long-press a real app → deep shortcuts + info + uninstall
      if (!APPS[appId]) bindShortcuts(el, appId);

      // dragging an app out of CORE builds a Split Flow (docs/01 §13)
      draggable(el, {
        onStart: () => ctx.onTileDragStart?.(appId, el),
        onMove: (e, d) => ctx.onTileDragMove?.(appId, el, d, e),
        onEnd: (e, d) => ctx.onTileDragEnd?.(appId, el, d, e),
      });
    });
  }

  /* long-press popup for real apps */
  let pop = null;
  function closePop() { pop?.remove(); pop = null; }
  function bindShortcuts(el, appId) {
    let timer = null;
    const start = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => openPop(el, appId), 480);
    };
    const cancel = () => clearTimeout(timer);
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', cancel);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); openPop(el, appId); });
  }
  function openPop(el, appId) {
    closePop();
    const shortcuts = realShortcuts(appId).slice(0, 4);
    pop = h('div', { class: 'core__pop' },
      h('b', { class: 'core__pop-title' }, realAppLabel(appId)),
      ...shortcuts.map((s) => h('button', {
        class: 'core__pop-item',
        onclick: () => { closePop(); launchRealShortcut(appId, s.id); },
      }, h('span', { html: icon('actions', 'ico ico--sm') }), h('span', {}, s.l || s.id))),
      h('button', {
        class: 'core__pop-item', onclick: () => { closePop(); openRealAppInfo(appId); },
      }, h('span', { html: icon('shield', 'ico ico--sm') }), h('span', {}, 'معلومات التطبيق')),
      h('button', {
        class: 'core__pop-item core__pop-item--danger', onclick: () => { closePop(); uninstallRealApp(appId); },
      }, h('span', { html: icon('close', 'ico ico--sm') }), h('span', {}, 'إلغاء التثبيت')),
    );
    el.append(pop);
    NovaMotion.spring({
      from: 0, to: 1, springName: 'SNAP',
      onUpdate: (v) => {
        pop.style.opacity = String(Math.min(1, v * 1.6));
        pop.style.transform = `translate3d(0, ${((1 - v) * 12).toFixed(1)}px, 0) scale(${(0.9 + 0.1 * v).toFixed(3)})`;
      },
    });
    const away = (e) => {
      if (!pop || pop.contains(e.target)) return;
      closePop();
      document.removeEventListener('pointerdown', away, true);
    };
    setTimeout(() => document.addEventListener('pointerdown', away, true), 60);
  }

  const el = h('div', { class: 'panel panel--core' },
    h('div', { class: 'panel__grip' }, h('i')),
    h('div', { class: 'core' },
      search,
      results,
      orbit,
      count,
      tiles,
    ),
  );

  el.style.transform = 'translate3d(0, 100%, 0)';
  el.style.opacity = '0';
  layer.append(el);
  buildTiles();

  function resultRow(faceHtml, title, sub, color, fn) {
    return h('button', {
      class: 'core__result',
      style: { width: '100%', textAlign: 'initial' },
      dataset: { nodrag: '1' },
      onclick: fn,
    }, h('span', { style: { color }, html: typeof faceHtml === 'string' ? faceHtml : '' }),
      ...(typeof faceHtml !== 'string' ? [faceHtml] : []),
      h('span', {}, title), h('small', {}, sub));
  }

  function showAll() {
    if (!isNativeLauncher()) return;
    const found = realApps();
    results.classList.remove('hidden');
    results.replaceChildren(...found.slice(0, 40).map((a) => resultRow(
      h('img', { class: 'core__result-img', src: realAppIcon(a.p), alt: a.l, draggable: 'false' }),
      a.l, 'تطبيق', '#6c5ce7',
      () => ctx.onOpenApp?.(a.p, el),
    )));
  }

  function runSearch(q) {
    if (!q) { results.classList.add('hidden'); results.replaceChildren(); return; }
    const out = [];

    // demo catalogue (always searchable — it is the NOVA experience layer)
    for (const app of Object.values(APPS)) {
      if (app.name.includes(q) || q.includes(app.name)) {
        out.push(resultRow(icon(app.icon, 'ico ico--sm'), app.name, 'تطبيق', app.color,
          () => ctx.onOpenApp?.(app.id, el)));
      }
    }

    // real installed apps
    if (isNativeLauncher()) {
      const ql = q.toLowerCase();
      for (const a of realApps()) {
        if (out.length >= 8) break;
        if (a.l.includes(q) || a.l.toLowerCase().includes(ql)) {
          const pkg = a.p;
          out.push(resultRow(
            h('img', { class: 'core__result-img', src: realAppIcon(pkg), alt: a.l, draggable: 'false' }),
            a.l, 'تطبيق مثبّت', '#6c5ce7',
            () => ctx.onOpenApp?.(pkg, el),
          ));
        }
      }
      // real contacts → call
      for (const c of searchRealContacts(q).slice(0, 3)) {
        out.push(resultRow(icon('phone', 'ico ico--sm'), c.n, c.p || 'جهة اتصال', '#7dd3fc',
          () => { if (c.p) dialNumber(c.p); else ctx.toast?.(c.n); }));
      }
    }

    if ('محمد'.includes(q) || q.includes('محمد')) {
      out.unshift(
        resultRow(icon('chat', 'ico ico--sm'), 'محادثة محمد', 'رسائل', '#34d399', () => ctx.onOpenApp?.('whatsapp', el)),
        resultRow(icon('phone', 'ico ico--sm'), 'محمد — اتصال', 'جهات', '#7dd3fc', () => ctx.onOpenApp?.('whatsapp', el)),
      );
    }
    if (!isNativeLauncher()) {
      for (const c of CONTACTS.filter((c) => c.kind === 'person' && c.name.includes(q)).slice(0, 2)) {
        out.push(resultRow(icon('people', 'ico ico--sm'), c.name, 'جهة اتصال', '#7dd3fc',
          () => ctx.toast?.(`الاتصال بـ ${c.name}`)));
      }
    }
    out.push(resultRow(icon('files', 'ico ico--sm'), `ملفات فيها «${q}»`, 'الملفات', '#f5a524',
      () => ctx.onOpenApp?.('notes', el)));
    out.push(resultRow(icon('actions', 'ico ico--sm'), `إجراء: إرسال «${q}»`, 'NOVA INTELLIGENCE', '#6c5ce7',
      () => ctx.toast?.(`جاهز لتنفيذ: إرسال «${q}»`)));

    results.classList.remove('hidden');
    results.replaceChildren(...out.slice(0, 8));

    // results arrive as one wave
    const kids = Array.from(results.children);
    kids.forEach((k) => { k.style.opacity = '0'; });
    const c = NovaMotion.cascade({
      items: kids,
      stagger: 30,
      span: 380,
      springName: 'SNAP',
      onUpdate: (node, _i, p) => {
        node.style.opacity = String(Math.min(1, p * 1.5));
        node.style.transform = `translate3d(0, ${((1 - p) * 14).toFixed(1)}px, 0)`;
      },
    });
    c.release('commit', 600);
  }

  function animateOrbit(dir = 'commit', velocity = 900) {
    closePop();
    const orb = NovaMotion.orbital({
      items: orbEls,
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

  try {
    window.addEventListener('NovaOnAppsChanged', () => buildTiles());
    window.addEventListener('nova:launcher', () => buildTiles());
  } catch { /* ignore */ }

  return {
    el, input, runSearch, animateOrbit, showAll,
    tileEl: (id) => tileEls.get(id), tiles,
    refresh: buildTiles,
  };
}
