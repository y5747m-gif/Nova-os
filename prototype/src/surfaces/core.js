/* ══════════════════════════════════════════════════════════════
   NOVA CORE — the system centre (docs/01 §5, §11)
   Swipe up from the bottom. Orbital launchpad + NOVA FIND.
   Inside the APK the tiles are REAL installed apps (usage-ranked)
   and a full alphabetical app drawer (كل التطبيقات) is one tap
   away — every installed app, real icons, long-press deep
   shortcuts that actually show.
   ══════════════════════════════════════════════════════════════ */

import { h, clear, gradient } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS, CONTACTS, appMeta } from '../core/store.js';
import NovaMotion from '../motion/motion.js';
import { stagger as staggerMs } from '../motion/config.js';
import { draggable } from '../motion/gestures.js';
import {
  isNativeLauncher, realApps, realAppIcon, realAppLabel, topRealApps,
  searchRealContacts, dialNumber, realShortcuts, launchRealShortcut,
  openRealAppInfo, uninstallRealApp, realIconsBatch,
} from '../core/launcher.js';

const ORBIT_ITEMS = [
  { id: 'search', label: 'بحث', icon: 'search' },
  { id: 'apps', label: 'تطبيقات', icon: 'apps' },
  { id: 'people', label: 'أشخاص', icon: 'people' },
  { id: 'files', label: 'ملفات', icon: 'files' },
  { id: 'canvas', label: 'المساحة', icon: 'layers' },
];

const DEMO_TILES = ['whatsapp', 'gallery', 'music', 'notes', 'browser', 'maps'];

/* Arabic-aware search normalisation: hamza forms, tāʾ marbūṭa, alef maqṣūra,
   tatweel and diacritics collapse so «احمد» finds «أحمد». */
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function matches(text, q) {
  const t = norm(text);
  const n = norm(q);
  return t.includes(n) || n.includes(t);
}

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
        else if (it.id === 'apps') showAll();
        else if (it.id === 'people') { setView('tiles'); input.value = ''; runSearch('محمد'); input.focus(); }
        else { setView('tiles'); input.value = ''; runSearch(it.label); input.focus(); }
      },
    }, h('span', { html: icon(it.icon, 'ico') }), h('span', { class: 'label' }, it.label));
    orbit.append(el);
    orbEls.push(el);
  });

  /* ── view tabs: مقترحة / كل التطبيقات ──────────────────────── */
  let view = 'tiles';
  const tabTiles = h('button', {
    class: 'core__tab core__tab--on',
    onclick: () => { ctx.emit?.('tick'); setView('tiles'); },
  }, icon('actions', 'ico ico--sm'), h('span', {}, 'المقترحة'));
  const tabGrid = h('button', {
    class: 'core__tab',
    onclick: () => { ctx.emit?.('tick'); setView('grid'); },
  }, icon('apps', 'ico ico--sm'), h('span', { id: 'tab-grid-label' }, 'كل التطبيقات'));
  const tabs = h('div', { class: 'core__tabs' }, tabTiles, tabGrid);

  function setView(v) {
    closePop();
    view = v;
    tabTiles.classList.toggle('core__tab--on', v === 'tiles');
    tabGrid.classList.toggle('core__tab--on', v === 'grid');
    tiles.classList.toggle('hidden', v !== 'tiles');
    gridWrap.classList.toggle('hidden', v !== 'grid');
    count.textContent = v === 'tiles'
      ? (isNativeLauncher() ? 'مقترح لك' : 'تطبيقات')
      : drawerTitle();
    if (v === 'grid') buildGrid();
  }

  function drawerTitle() {
    const n = isNativeLauncher() ? realApps().length : Object.keys(APPS).length;
    return `كل التطبيقات · ${n}`;
  }

  const tiles = h('div', { class: 'core__row' });
  const tileEls = new Map();
  const count = h('div', { class: 'home__section-title', style: { margin: '2px 2px 0' } }, 'تطبيقات');
  const grid = h('div', { class: 'core__grid' });
  const gridWrap = h('div', { class: 'core__grid-wrap hidden' }, grid);
  gridWrap.addEventListener('scroll', () => closePop(), { passive: true });

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
    if (view === 'tiles') count.textContent = isNativeLauncher() ? 'مقترح لك' : 'تطبيقات';
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

  /* ── the drawer: every installed app, alphabetical, real icons ── */
  const iconQueue = [];
  let draining = false;

  function scheduleIconDrain() {
    if (draining) return;
    draining = true;
    const drain = () => {
      const chunk = iconQueue.splice(0, 30);
      if (!chunk.length) { draining = false; return; }
      // ONE bridge crossing per screenful — icons paint in waves,
      // the JS thread never locks up tile by tile
      const pkgs = [];
      for (const it of chunk) if (it.slot?.isConnected) pkgs.push(it.pkg);
      realIconsBatch(pkgs);
      for (const { pkg, slot } of chunk) {
        if (!slot?.isConnected) continue;
        const uri = realAppIcon(pkg);
        if (uri) slot.replaceChildren(h('img', { class: 'tile-img', src: uri, alt: realAppLabel(pkg), draggable: 'false' }));
      }
      if (iconQueue.length) setTimeout(drain, 0);
      else draining = false;
    };
    setTimeout(drain, 0);
  }

  function fallbackFace(name) {
    const hue = (String(name).charCodeAt(0) || 70) % 360;
    return h('span', {
      class: 'tile-fallback',
      style: { background: gradient(hue) },
      text: String(name || '؟').trim().slice(0, 1) || '؟',
    });
  }

  function buildGrid(q = '') {
    grid.replaceChildren();
    const query = q ?? input.value.trim();
    let entries;
    if (isNativeLauncher()) {
      entries = realApps()
        .filter((a) => !query || matches(a.l, query))
        .map((a) => ({ p: a.p, name: a.l }));
    } else {
      entries = Object.values(APPS)
        .filter((m) => !query || matches(m.name, query))
        .map((m) => ({ p: m.id, name: m.name, demo: true }));
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const queue = [];
    for (const e of entries) {
      const face = APPS[e.p]
        ? h('span', { class: 'ico-wrap', html: icon(appMeta(e.p).icon, 'ico ico--sm') })
        : fallbackFace(e.name);
      const el = h('button', {
        class: 'app-tile',
        dataset: { app: e.p },
        title: e.name,
        onclick: () => ctx.onOpenApp?.(e.p, el),
      }, face, h('span', {}, e.name));
      if (!APPS[e.p]) {
        bindShortcuts(el, e.p);
        queue.push({ pkg: e.p, slot: el.firstChild });
      }
      grid.append(el);
    }

    if (!entries.length) {
      grid.append(h('div', { class: 'core__empty' },
        h('span', { html: icon('search', 'ico') }),
        h('span', {}, 'مفيش تطبيق بالاسم ده'),
      ));
    }

    // real icons arrive in batches — one bridge crossing per screenful,
    // so 200 apps paint instantly instead of blocking tile by tile
    iconQueue.length = 0;          // a fresh build supersedes pending fills
    iconQueue.push(...queue);
    scheduleIconDrain();
  }

  /* ── long-press popup: real icons, never clipped ────────────────
     The popup lives on the PANEL (not inside the tile), so the
     tile's ripple clipping and the grid's scroll container can't
     cut it off. Placement flips above/below and stays in bounds. */
  let pop = null;
  let popAnchor = null;

  function closePop() {
    if (pop) { pop.remove(); pop = null; }
    popAnchor = null;
    document.removeEventListener('pointerdown', awayHandler, true);
  }

  function awayHandler(e) {
    if (!pop) { document.removeEventListener('pointerdown', awayHandler, true); return; }
    if (pop.contains(e.target) || popAnchor?.contains(e.target)) return;
    closePop();
  }

  function placePop(anchor) {
    if (!pop) return;
    const pr = el.getBoundingClientRect();
    const tr = anchor.getBoundingClientRect();
    if (!pr.width || !tr.width) return;
    const half = Math.max(105, (pop.offsetWidth || 220) / 2);
    const hpx = pop.offsetHeight || 190;
    let x = tr.left + tr.width / 2 - pr.left;
    x = Math.max(half + 8, Math.min(pr.width - half - 8, x));
    let y = tr.top - pr.top - hpx - 10;          // above the tile
    if (y < 10) y = tr.bottom - pr.top + 10;     // flip below near the top edge
    pop.style.left = `${Math.round(x)}px`;
    pop.style.top = `${Math.round(y)}px`;
  }

  function bindShortcuts(anchor, appId) {
    let timer = null;
    const start = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => openPop(anchor, appId), 480);
    };
    const cancel = () => clearTimeout(timer);
    anchor.addEventListener('pointerdown', start);
    anchor.addEventListener('pointermove', cancel);
    anchor.addEventListener('pointerup', cancel);
    anchor.addEventListener('pointercancel', cancel);
    anchor.addEventListener('contextmenu', (e) => { e.preventDefault(); openPop(anchor, appId); });
  }

  function appFace(appId) {
    const uri = realAppIcon(appId);
    if (uri) return h('img', { class: 'core__pop-img', src: uri, alt: '', draggable: 'false' });
    return fallbackFace(realAppLabel(appId));
  }

  function openPop(anchor, appId) {
    closePop();
    popAnchor = anchor;
    const shortcuts = realShortcuts(appId).slice(0, 4);
    const card = h('div', { class: 'core__pop-card' },
      h('div', { class: 'core__pop-head' },
        appFace(appId),
        h('b', { class: 'core__pop-title' }, realAppLabel(appId)),
      ),
      ...shortcuts.map((s) => h('button', {
        class: 'core__pop-item',
        onclick: () => { closePop(); launchRealShortcut(appId, s.id); },
      },
        s.i
          ? h('img', { class: 'core__pop-sico', src: s.i, alt: '', draggable: 'false' })
          : h('span', { html: icon('actions', 'ico ico--sm') }),
        h('span', {}, s.l || s.id))),
      h('button', {
        class: 'core__pop-item', onclick: () => { closePop(); openRealAppInfo(appId); },
      }, h('span', { html: icon('shield', 'ico ico--sm') }), h('span', {}, 'معلومات التطبيق')),
      h('button', {
        class: 'core__pop-item core__pop-item--danger', onclick: () => { closePop(); uninstallRealApp(appId); },
      }, h('span', { html: icon('close', 'ico ico--sm') }), h('span', {}, 'إلغاء التثبيت')),
    );
    pop = h('div', { class: 'core__pop', dataset: { nodrag: '1' } }, card);
    el.append(pop);
    placePop(anchor);
    ctx.emit?.('tick');
    // the entrance spring drives the card; the wrapper owns placement
    NovaMotion.spring({
      from: 0, to: 1, springName: 'SNAP',
      onUpdate: (v) => {
        card.style.opacity = String(Math.min(1, v * 1.6));
        card.style.transform = `translate3d(0, ${((1 - v) * 12).toFixed(1)}px, 0) scale(${(0.9 + 0.1 * v).toFixed(3)})`;
      },
    });
    setTimeout(() => document.addEventListener('pointerdown', awayHandler, true), 60);
  }

  const el = h('div', { class: 'panel panel--core' },
    h('div', { class: 'panel__grip' }, h('i')),
    h('div', { class: 'core' },
      search,
      results,
      orbit,
      tabs,
      count,
      tiles,
      gridWrap,
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

  /* showAll keeps its old job — the orbit's «تطبيقات» opens the drawer */
  function showAll() {
    results.classList.add('hidden');
    results.replaceChildren();
    input.value = '';
    setView('grid');
  }

  function runSearch(q) {
    closePop();
    if (!q) {
      results.classList.add('hidden');
      results.replaceChildren();
      orbit.classList.remove('hidden');
      tabs.classList.remove('hidden');
      count.classList.remove('hidden');
      tiles.classList.toggle('hidden', view !== 'tiles');
      gridWrap.classList.toggle('hidden', view !== 'grid');
      count.textContent = view === 'tiles'
        ? (isNativeLauncher() ? 'مقترح لك' : 'تطبيقات')
        : drawerTitle();
      return;
    }

    // while searching, the whole panel belongs to NOVA FIND
    orbit.classList.add('hidden');
    tabs.classList.add('hidden');
    tiles.classList.add('hidden');
    gridWrap.classList.add('hidden');
    count.classList.add('hidden');

    const out = [];

    // real installed apps first — this is a phone, not a demo
    if (isNativeLauncher()) {
      const ql = q.toLowerCase();
      for (const a of realApps()) {
        if (out.length >= 12) break;
        if (a.l.includes(q) || a.l.toLowerCase().includes(ql) || matches(a.l, q)) {
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
      if (out.length) {
        out.push(resultRow(icon('apps', 'ico ico--sm'), `«${q}» في كل التطبيقات`, 'فتح الدرج', '#6c5ce7',
          () => { setView('grid'); buildGrid(q); orbit.classList.add('hidden'); tabs.classList.remove('hidden'); count.classList.remove('hidden'); count.textContent = drawerTitle(); gridWrap.classList.remove('hidden'); results.classList.add('hidden'); }));
      }
    }

    // demo catalogue — the NOVA experience layer in a browser
    if (!isNativeLauncher()) {
      for (const app of Object.values(APPS)) {
        if (matches(app.name, q) || norm(q).includes(norm(app.name))) {
          out.push(resultRow(icon(app.icon, 'ico ico--sm'), app.name, 'تطبيق', app.color,
            () => ctx.onOpenApp?.(app.id, el)));
        }
      }
      if (matches('محمد', q) || norm(q).includes(norm('محمد'))) {
        out.unshift(
          resultRow(icon('chat', 'ico ico--sm'), 'محادثة محمد', 'رسائل', '#34d399', () => ctx.onOpenApp?.('whatsapp', el)),
          resultRow(icon('phone', 'ico ico--sm'), 'محمد — اتصال', 'جهات', '#7dd3fc', () => ctx.onOpenApp?.('whatsapp', el)),
        );
      }
      for (const c of CONTACTS.filter((c) => c.kind === 'person' && matches(c.name, q)).slice(0, 2)) {
        out.push(resultRow(icon('people', 'ico ico--sm'), c.name, 'جهة اتصال', '#7dd3fc',
          () => ctx.toast?.(`الاتصال بـ ${c.name}`)));
      }
      out.push(resultRow(icon('files', 'ico ico--sm'), `ملفات فيها «${q}»`, 'الملفات', '#f5a524',
        () => ctx.onOpenApp?.('notes', el)));
      out.push(resultRow(icon('actions', 'ico ico--sm'), `إجراء: إرسال «${q}»`, 'NOVA INTELLIGENCE', '#6c5ce7',
        () => ctx.toast?.(`جاهز لتنفيذ: إرسال «${q}»`)));
    }

    results.classList.remove('hidden');
    results.replaceChildren(...out.slice(0, 16));

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
    window.addEventListener('NovaOnAppsChanged', () => { buildTiles(); if (view === 'grid') buildGrid(); });
    window.addEventListener('nova:launcher', () => { buildTiles(); if (view === 'grid') buildGrid(); });
  } catch { /* ignore */ }

  return {
    el, input, runSearch, animateOrbit, showAll,
    tileEl: (id) => tileEls.get(id), tiles,
    refresh: () => { buildTiles(); if (view === 'grid') buildGrid(); },
    closePop,
    get view() { return view; },
  };
}
