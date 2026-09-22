/* ══════════════════════════════════════════════════════════════
   NOVA OS — prototype controller
   Owns the surface state machine, the gesture zones and the
   transitions between everything. Product behaviour lives here;
   physics lives in motion/.
   ══════════════════════════════════════════════════════════════ */

import { h, clear, fmtTime } from './core/dom.js';
import { icon } from './core/icons.js';
import {
  APPS, appMeta, state, pushEvent, makeEvent, deferEvent, notify, rememberWindow, subscribe,
} from './core/store.js';
import {
  isNativeLauncher, launchRealApp,
} from './core/launcher.js';
import {
  initWallpaper, setWallpaper, wallpaperId, WALLPAPERS, onWallpaperChange,
} from './core/wallpaper.js';
import { attachGestures, draggable } from './motion/gestures.js';
import NovaMotion, { rectOf, clamp } from './motion/motion.js';
import { createFx } from './motion/fx.js';
import {
  setProfile, setTheme, setMode, setAccent, nova, PROFILES, THEMES, ACCENTS,
  onConfigChange, token, springConfig, currentOvershoot, blurPx,
} from './motion/config.js';
import { initAudio, playSound } from './core/sound.js';
import { NOVA_VERSION } from './core/version.js';
import {
  createInstaller, registerServiceWorker, checkForUpdate, applyUpdate, isStandalone,
} from './core/install.js';
import { haptic, hapticBudgetLeft } from './core/haptics.js';
import { stats } from './motion/ticker.js';

import { mountHome } from './surfaces/home.js';
import { buildApp } from './surfaces/app.js';
import { mountCore } from './surfaces/core.js';
import { mountFlow } from './surfaces/flow.js';
import { createOrb } from './surfaces/orb.js';
import { mountCanvas } from './surfaces/canvas.js';
import { mountControl } from './surfaces/control.js';
import { mountLock } from './surfaces/lock.js';
import { buildSplit } from './surfaces/split.js';
import { createDnd } from './surfaces/dnd.js';
import { mountSetup } from './surfaces/setup.js';
import { playAppLaunch, canPlayLaunch, popRect } from './surfaces/launch.js';

/* ── element handles ───────────────────────────────────────────── */
const screen = document.getElementById('screen');
const L = {
  wallpaper: document.getElementById('layer-wallpaper'),
  home: document.getElementById('layer-home'),
  apps: document.getElementById('layer-apps'),
  split: document.getElementById('layer-split'),
  canvas: document.getElementById('layer-canvas'),
  panels: document.getElementById('layer-panels'),
  overlay: document.getElementById('layer-overlay'),
  lock: document.getElementById('layer-lock'),
};
const statusbar = document.getElementById('statusbar');
const toastEl = document.getElementById('toast');
const caption = document.getElementById('gesture-caption');

/* inside the APK the REAL system bars are drawn over NOVA (transparent,
   edge-to-edge) — the demo clock/battery would double them on a phone */
if (isNativeLauncher()) statusbar.classList.add('status--native');

/* ── wallpaper blobs (Dynamic Space) + the living FX layer ─────── */
L.wallpaper.append(h('i'), h('i'), h('i'), h('i', { class: 'blob-aurora' }));
/* restore the saved wallpaper scene (aurora / sunset / صورتي / system …) */
initWallpaper();
let fx = null;
try {
  fx = createFx(document.getElementById('fx'));
} catch { fx = null; }

/* ── status bar ────────────────────────────────────────────────── */
function paintStatus() {
  const privacy = '<span class="dot" title="الكاميرا/الموقع مستخدَمان الآن">●</span>';
  statusbar.innerHTML = `
    <span>${fmtTime()}</span>
    <span class="status__right">${privacy}<span>72%</span>${icon('battery', 'ico ico--sm')}</span>`;
}
paintStatus();
setInterval(paintStatus, 20000);

/* ── toast + emit wiring (one event → motion + sound + haptic) ─── */
let toastTimer = null;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.dataset.show = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.dataset.show = '0'; }, ms);
}

window.addEventListener('nova:emit', (e) => {
  const kind = e.detail?.kind;
  playSound(kind);
  haptic(kind === 'open' ? 'open' : kind === 'close' ? 'close' : kind === 'tick' ? 'tick' : kind);
});
window.addEventListener('pointerdown', () => initAudio(), { once: true });

/* ── surfaces ──────────────────────────────────────────────────── */
const ui = {
  home: mountHome(L.home, {
    onOpenApp: (appId, el) => openApp(appId, el),
    onTask: () => openPanel('flow'),
    onAllApps: () => {
      if (state.surface === 'lock') return;
      openPanel('core');
      setTimeout(() => { try { ui.core.showAll(); } catch { /* ignore */ } }, 80);
    },
  }),
  core: null,
  flow: null,
  canvas: mountCanvas(L.canvas, {
    onOpenApp: (appId, el) => openApp(appId, el),
    onSwept: () => toast('تم تفريغ المساحة — النظام بيدير الموارد لوحده'),
  }),
  control: null,
  lock: mountLock(L.lock, {}),
  orb: createOrb(L.overlay, {
    onPrimary: (evt) => {
      ui.orb.dismiss('handled');
      if (evt.liveKey && isNativeLauncher()) {
        try { window.NovaSystem.openNotification(evt.liveKey); } catch { /* ignore */ }
        toast(`فتح ${evt.who}`);
        return;
      }
      openApp('whatsapp', ui.home.cardEl('whatsapp'));
      toast(`رد على ${evt.who}`);
    },
    onDefer: (evt) => { deferEvent(evt.id); ui.flow.render(); toast('تم تأجيل الحدث'); },
    onDismiss: () => { state.orb = null; },
    emit: (k) => NovaMotion.emit(k),
  }),
  dnd: createDnd({
    layer: L.overlay,
    screen,
    ctx: {
      emit: (k) => NovaMotion.emit(k),
      toast,
      onDropOnPerson: (contact, photoIndex) => {
        openApp('whatsapp', ui.home.cardEl('whatsapp'), { staged: { index: photoIndex, to: contact.name } });
        toast(`الصورة جاهزة للإرسال إلى ${contact.name}`);
      },
    },
  }),
};

ui.install = createInstaller({
  layer: L.overlay,
  toast,
  emit: (k) => NovaMotion.emit(k),
});

/* first-run wizard (native shell only — browsers never see it) */
ui.setup = mountSetup(L.overlay, {
  toast,
  emit: (k) => NovaMotion.emit(k),
  burst: () => {
    try {
      fx?.burst(screen.clientWidth / 2, screen.clientHeight * 0.4, '', 60);
    } catch { /* ignore */ }
  },
});

ui.core = mountCore(L.panels, {
  onOpenApp: (appId, el) => openApp(appId, el),
  onCanvas: () => { closePanel(); showCanvas(); },
  toast,
  onTileDragStart: startTileDrag,
  onTileDragMove: moveTileDrag,
  onTileDragEnd: endTileDrag,
});

ui.flow = mountFlow(L.panels, {
  toast,
  emit: (k) => NovaMotion.emit(k),
  onPrimary: (evt) => {
    closePanel();
    if (evt.who === 'محمد' || evt.who === 'سارة') openApp('whatsapp', ui.home.cardEl('whatsapp'));
    else if (evt.who === 'التقويم') { showCanvas(); toast('فتح مساحة الاجتماع'); }
    else openApp('gallery', ui.home.cardEl('gallery'));
  },
  onSecondary: (evt) => { deferEvent(evt.id); ui.flow.render(); toast('تم التأجيل — هيرجع في سياقه'); },
});

ui.control = mountControl(L.panels, {
  onCore: () => { closePanel(); setTimeout(() => openPanel('core'), 120); },
  onClose: () => closePanel(),
  emit: (k) => NovaMotion.emit(k),
  onToggle: (def, on) => toast(`${def.label}: ${on ? 'مُشغّل' : 'مُطفأ'}`),
  onValueChange: (def) => { },
  onCustomize: () => {
    closePanel(true);
    if (state.surface === 'lock') {
      state.surface = 'home';
      ui.lock.setVisible(false);
      ui.home.setHidden(false);
      ui.home.enter();
    }
    setTimeout(() => openApp('settings', null), 140);
  },
});

ui.flow.el.style.top = '0';
ui.flow.el.style.bottom = 'auto';
ui.flow.el.style.borderRadius = '0 0 var(--nv-r-panel) var(--nv-r-panel)';
ui.flow.el.style.transformOrigin = 'top center';

/* The store is the source of truth: an event that arrives while media is
   playing must never interrupt — it becomes an orb at the edge (docs/01 §7). */
subscribe((s, what) => {
  if (what === 'events') {
    if (s.orb?.event && !ui.orb.active) ui.orb.show(s.orb.event);
    if (state.panel === 'flow') ui.flow.render();
  }
  if (what === 'windows' && state.surface === 'canvas') ui.canvas.render();
});

/* ── panel controllers (gesture-driven) ───────────────────────── */
const PANELS = {
  core: { el: ui.core.el, from: 'bottom' },
  flow: { el: ui.flow.el, from: 'top' },
  control: { el: ui.control.el, from: 'top' },
};

const panelCtl = {};
for (const [name, cfg] of Object.entries(PANELS)) {
  if (name === 'control') continue; // CONTROL is a full overlay, not a sheet
  panelCtl[name] = NovaMotion.panel({
    el: cfg.el,
    from: cfg.from,
    distance: cfg.from === 'bottom' ? 620 : 620,
    springName: cfg.from === 'bottom' ? 'SOFT' : 'SOFT',
  });
}

let controlProgress = 0;
function setControlProgress(p) {
  controlProgress = clamp(p);
  ui.control.el.style.opacity = String(controlProgress);
  ui.control.el.style.transform = `scale(${(0.95 + 0.05 * controlProgress).toFixed(4)})`;
  ui.control.el.style.pointerEvents = controlProgress > 0.2 ? 'auto' : 'none';
}
setControlProgress(0);

/* ── helpers ───────────────────────────────────────────────────── */
const screenRect = () => ({ x: 0, y: 0, w: screen.clientWidth, h: screen.clientHeight });

function rectForApp(appId) {
  const card = ui.home.cardEl(appId);
  if (card) return rectOf(card, screen);
  const tile = ui.core.tileEl(appId);
  if (tile) return rectOf(tile, screen);
  const win = ui.canvas.winEl(appId);
  if (win) return rectOf(win, screen);
  return { x: screen.clientWidth - 200, y: screen.clientHeight - 220, w: 180, h: 92 };
}

function rememberWorkspace(appId) {
  const slots = [
    { x: 22, y: 150 }, { x: 116, y: 382 }, { x: 30, y: 596 }, { x: 150, y: 760 },
  ];
  if (!state.windows.some((w) => w.appId === appId)) {
    const slot = slots[state.windows.length % slots.length];
    rememberWindow(appId, slot.x, slot.y);
  }
  if (!state.lastWorkspace.includes(appId)) state.lastWorkspace = [appId, ...state.lastWorkspace].slice(0, 3);
}

/* ── app surface lifecycle ─────────────────────────────────────── */
let appCtl = null;   // { appId, el, morph, host }
let returnTo = 'home'; // where Back goes: 'home' or the canvas the app was opened from
let launchFlight = null; // the in-flight launch bubble (cancelable)

function appCtx(appId, opts) {
  return {
    staged: opts.staged || null,
    toast,
    emit: (k) => NovaMotion.emit(k),
    onMedia: (v) => { state.mediaPlaying = v; },
    onCollapse: () => collapseToCanvas(),
    onStagedSent: () => { state.staged = null; },
  };
}

function openApp(appId, sourceEl, opts = {}) {
  if (state.surface === 'lock') return;
  // a real installed package inside the APK → launch it with a NOVA exit
  if (isNativeLauncher() && !APPS[appId]) {
    launchNativeApp(appId, sourceEl);
    return;
  }
  if (state.panel) closePanel(true);
  if (appCtl && appCtl.appId === appId) return;

  const back = state.surface === 'canvas' ? 'canvas' : 'home';
  const srcRect = sourceEl && sourceEl.getBoundingClientRect ? rectOf(sourceEl, screen) : null;

  // انميشن اختيار التطبيق: the icon becomes a bubble, rises to the
  // middle of the screen, pops — and the app blooms from the pop point
  if (canPlayLaunch(sourceEl) && srcRect) {
    launchFlight?.cancel();
    launchFlight = playAppLaunch({
      srcRect,
      appId,
      overlay: L.overlay,
      screen,
      fx,
      onPop: () => {
        launchFlight = null;
        if (state.surface === 'lock') return;
        mountAppSurface(appId, popRect(screen), opts, back);
      },
    });
    return;
  }

  mountAppSurface(appId, srcRect || rectForApp(appId), opts, back);
}

/* the app surface itself — `from` is where it blooms from */
function mountAppSurface(appId, from, opts = {}, back = 'home') {
  returnTo = back;
  const { el, meta } = buildApp(appId, appCtx(appId, opts));

  // one host element per surface so the back gesture can translate it
  const host = h('div', { class: 'app-host', style: { position: 'absolute', inset: '0', willChange: 'transform' } }, el);
  clear(L.apps);
  L.apps.append(host);

  if (meta.kind === 'gallery') ui.dnd.enablePhotoDrag(el);

  const chrome = el.querySelector('.app__chrome');
  const body = el.querySelector('.app__body');
  const to = screenRect();
  const morph = NovaMotion.morph({
    el,
    from,
    to,
    radiusFrom: 20,
    radiusTo: 28,
    springName: 'SOFT',
    travel: Math.hypot(to.w - from.w, to.h - from.h),
    arc: 0.65,
    blur: 7,
    onProgress: (p) => {
      chrome.style.opacity = String(clamp((p - 0.35) / 0.4));
      body.style.opacity = String(clamp((p - 0.5) / 0.35));
      ui.home.root.style.opacity = String(1 - 0.35 * p);
      ui.home.root.style.transform = `scale(${(1 - 0.035 * p).toFixed(4)})`;
    },
    onDone: (dir) => {
      if (dir === 'commit') {
        state.surface = 'app';
        state.focusedApp = appId;
        // the canvas sits above the app layer, so park it while the app is open
        if (returnTo === 'canvas') ui.canvas.setActive(false);
        else ui.home.setHidden(true);
        paintCaption();
      }
    },
  });
  morph.release('commit', 900);

  state.surface = 'app';
  state.focusedApp = appId;
  appCtl = { appId, el, host, morph };
  paintCaption();
}

/* launching a REAL app: the icon lifts off as a bubble, arcs to the
   middle of the screen and pops in a NOVA spark — then Android takes
   over. NOVA stays home. */
function launchNativeApp(pkg, sourceEl) {
  if (state.panel) closePanel(true);
  const handOff = () => {
    rememberWorkspace(pkg);
    setTimeout(() => {
      if (!launchRealApp(pkg)) toast('تعذّر فتح التطبيق');
    }, 120);
  };
  const srcRect = sourceEl && sourceEl.getBoundingClientRect ? rectOf(sourceEl, screen) : null;
  if (canPlayLaunch(sourceEl) && srcRect) {
    launchFlight?.cancel();
    launchFlight = playAppLaunch({
      srcRect,
      appId: pkg,
      overlay: L.overlay,
      screen,
      fx,
      onPop: () => { launchFlight = null; handOff(); },
    });
    return;
  }
  NovaMotion.emit('open');
  try {
    const r = sourceEl?.getBoundingClientRect?.();
    const sr = screen.getBoundingClientRect();
    if (r && sr) fx?.burst(r.left - sr.left + r.width / 2, r.top - sr.top + r.height / 2, '', 34);
  } catch { /* ignore */ }
  handOff();
}

function finishApp(dir = 'home') {
  if (!appCtl) return;
  const { el, appId } = appCtl;
  const target = rectForApp(appId);
  const to = screenRect();
  const chrome = el.querySelector('.app__chrome');

  const ctl = NovaMotion.morph({
    el, from: target, to, radiusFrom: 20, radiusTo: 28, springName: 'SOFT', travel: 600,
    onProgress: (p) => { if (chrome) chrome.style.opacity = String(clamp((p - 0.35) / 0.4)); },
    onDone: () => {
      clear(L.apps);
      appCtl = null;
      ui.home.setHidden(false);
      ui.home.root.style.opacity = '1';
      ui.home.root.style.transform = '';
      state.surface = 'home';
      if (dir === 'canvas') showCanvas();
      else { ui.canvas.setActive(false); ui.home.refresh(); ui.home.enter(); }
      paintCaption();
    },
  });
  // start fully open, then let physics close it (always interruptible)
  ctl.set(1);
  ctl.release('cancel', 700);
  rememberWorkspace(appId);
  NovaMotion.emit('close');
}

function collapseToCanvas() {
  if (!appCtl) return;
  rememberWorkspace(appCtl.appId);
  finishApp('canvas');
}

/* ── back gesture (right edge, progress-driven) ────────────────── */
let back = null;

function backBegin(gesture) {
  if (!appCtl) return false;
  const { el, host, appId } = appCtl;
  const target = rectForApp(appId);
  const to = screenRect();
  const morph = NovaMotion.morph({
    el, from: target, to, radiusFrom: 20, radiusTo: 28, springName: 'SOFT',
    travel: to.w, manual: true,
  });
  morph.set(1);
  back = { morph, host, appId, q: 0 };
  ui.home.setHidden(false);
  return true;
}

function backSet(q) {
  if (!back) return;
  back.q = clamp(q);
  back.morph.set(1 - back.q * 0.92);
  back.host.style.transform = `translate3d(${(-back.q * screen.clientWidth * 0.3).toFixed(1)}px, 0, 0)`;
  back.host.style.opacity = String(1 - back.q * 0.35);
  ui.home.root.style.opacity = String(0.65 + 0.35 * back.q);
  ui.home.root.style.transform = `scale(${(0.965 + 0.035 * back.q).toFixed(4)})`;
}

function backEnd(commit, velocity) {
  if (!back) return;
  const b = back;
  back = null;
  if (commit) {
    // complete with physics seeded by the release velocity
    b.morph.release('cancel', velocity);
    NovaMotion.spring({
      from: b.q, to: 1, springName: 'SOFT',
      onUpdate: (v) => {
        b.host.style.transform = `translate3d(${(-v * screen.clientWidth * 0.34).toFixed(1)}px, 0, 0)`;
        b.host.style.opacity = String(Math.max(0, 1 - v * 1.4));
      },
    });
    NovaMotion.emit('close');
    const back = returnTo;
    setTimeout(() => {
      rememberWorkspace(b.appId);
      clear(L.apps);
      appCtl = null;
      if (back === 'canvas') { showCanvas(); return; }
      state.surface = 'home';
      ui.home.setHidden(false);
      ui.home.root.style.opacity = '1';
      ui.home.root.style.transform = '';
      ui.home.enter();
      paintCaption();
    }, 260);
  } else {
    backSet(0);
    b.morph.release('commit', velocity);
    NovaMotion.spring({
      from: b.q, to: 0, springName: 'SOFT',
      onUpdate: (v) => {
        b.host.style.transform = `translate3d(${(-v * screen.clientWidth * 0.3).toFixed(1)}px, 0, 0)`;
        b.host.style.opacity = String(1 - v * 0.35);
      },
    });
  }
}

/* ── panels (CORE / FLOW / CONTROL) ────────────────────────────── */

function panelHook(name) {
  if (name === 'control') return { set: setControlProgress, release: (dir, v) => {
    NovaMotion.spring({ from: controlProgress, to: dir === 'commit' ? 1 : 0, springName: 'SOFT', onUpdate: setControlProgress });
  } };
  return panelCtl[name];
}

function openPanel(name, fromGesture = false, velocity = 900) {
  if (state.surface === 'lock') return;
  if (state.panel === name) return;
  if (state.panel) closePanel(true);
  state.panel = name;
  if (name === 'control') {
    ui.control.enter();
    panelHook('control').release('commit', velocity);
    NovaMotion.emit('open');
    paintCaption();
    return;
  }
  panelCtl[name].release('commit', velocity);
  if (name === 'core') {
    try { ui.core.refresh?.(); } catch { /* ignore */ }
    setTimeout(() => ui.core.animateOrbit('commit', 900), 40);
  }
  if (name === 'flow') ui.flow.render();
  NovaMotion.emit('open');
  paintCaption();
}

function closePanel(silent = false) {
  const name = state.panel;
  if (!name) return;
  state.panel = null;
  if (name === 'control') {
    panelHook('control').release('cancel', 0);
  } else {
    panelCtl[name].release('cancel', 0);
    if (name === 'core') ui.core.animateOrbit('cancel', 0);
  }
  if (!silent) NovaMotion.emit('close');
  paintCaption();
}

/* ── canvas ────────────────────────────────────────────────────── */
function showCanvas() {
  state.surface = 'canvas';
  ui.canvas.el.style.opacity = '1';
  ui.canvas.setActive(true);
  ui.canvas.enter();
  NovaMotion.emit('open');
  paintCaption();
}

function hideCanvas() {
  NovaMotion.spring({
    from: 1, to: 0, springName: 'SOFT',
    onUpdate: (v) => { ui.canvas.el.style.opacity = String(v); },
    onDone: () => {
      ui.canvas.setActive(false);
      state.surface = 'home';
      ui.home.setHidden(false);
      ui.home.enter();
      paintCaption();
    },
  });
}

/* ── split flow ────────────────────────────────────────────────── */
let tileDrag = null;
let splitCtl = null;

function startTileDrag(appId, tileEl) {
  if (!appCtl) { tileDrag = { appId, moved: false }; return; }
  tileDrag = { appId, tileEl, moved: false, ghost: null };
}

function moveTileDrag(appId, tileEl, d, e) {
  if (!tileDrag || !appCtl || appCtl.appId === appId) return;
  if (!tileDrag.ghost) {
    tileDrag.ghost = h('div', {
      class: 'drag-ghost',
      style: {
        width: '74px', height: '74px', borderRadius: '22px', display: 'grid', placeItems: 'center',
        background: 'var(--nv-glass)', backdropFilter: 'blur(18px)', border: '1px solid var(--nv-line-strong)',
        color: 'var(--nv-accent)',
      },
      html: icon(appMeta(appId).icon, 'ico'),
    });
    L.overlay.append(tileDrag.ghost);
    closePanel(true);
  }
  tileDrag.moved = true;
  tileDrag.ghost.style.left = `${e.clientX - 37}px`;
  tileDrag.ghost.style.top = `${e.clientY - 37}px`;
  const r = screen.getBoundingClientRect();
  const inside = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
  tileDrag.ghost.style.background = inside ? 'color-mix(in srgb, var(--nv-accent) 34%, transparent)' : 'var(--nv-glass)';
}

function endTileDrag(appId, tileEl, d, e) {
  const drag = tileDrag;
  tileDrag = null;
  if (!drag || !drag.moved) return;
  drag.ghost?.remove();
  const r = screen.getBoundingClientRect();
  const inside = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
  if (!inside || !appCtl) { NovaMotion.emit('error'); return; }
  buildSplitFlow(appCtl.appId, appId, e);
}

function buildSplitFlow(host, guest, e) {
  const r = screen.getBoundingClientRect();
  const ratio = clamp(((e.clientY - r.top) / r.height) * 100, 22, 78);
  clear(L.split);
  const split = buildSplit({
    host,
    guest,
    ratio,
    ctx: {
      emit: (k) => NovaMotion.emit(k),
      onCollapseGuest: () => { closeSplit(); toast('الضيف اتصغّر لبطاقة'); },
    },
  });
  L.split.append(split.el);
  splitCtl = { ...split, host };
  state.split = { host, guest, ratio };
  state.surface = 'split';
  ui.home.setHidden(true);
  ui.home.root.style.opacity = '1';

  const from = { x: r.left, y: e.clientY - r.top - 20, w: 120, h: 80 };
  const morph = NovaMotion.morph({
    el: split.el, from, to: screenRect(), radiusFrom: 18, radiusTo: 28, springName: 'SOFT', travel: 500,
  });
  morph.release('commit', 900);
  NovaMotion.emit('open');
  toast(`Split Flow: ${appMeta(host).name} + ${appMeta(guest).name}`);
  paintCaption();
}

function closeSplit() {
  if (!splitCtl) return;
  const el = splitCtl.el;
  const target = rectForApp(splitCtl.host);
  const ctl = NovaMotion.morph({
    el, from: target, to: screenRect(), radiusFrom: 18, radiusTo: 28, springName: 'SOFT', travel: 500,
    onDone: () => {
      clear(L.split);
      splitCtl = null;
      state.split = null;
      state.surface = 'home';
      ui.home.setHidden(false);
      ui.home.enter();
      paintCaption();
    },
  });
  ctl.set(1);
  ctl.release('cancel', 700);
  NovaMotion.emit('close');
}

/* ── power menu (grows from the press point like an orb) ───────── */
function powerMenu(x, y) {
  if (document.querySelector('.power')) return;
  const items = [
    { label: 'إعادة التشغيل', icon: 'restart', note: 'NOVA', angle: -Math.PI / 2 },
    { label: 'إيقاف التشغيل', icon: 'power', note: 'ضغطة مطولة', angle: -Math.PI / 2 - 0.7 },
    { label: 'الطوارئ', icon: 'emergency', note: 'فوري', angle: -Math.PI / 2 + 0.7 },
  ];
  const layer = h('div', { class: 'power' });
  const els = items.map((it) => {
    const el = h('button', { class: 'power__item', style: { left: `${x}px`, top: `${y}px` } },
      h('span', { html: icon(it.icon, 'ico ico--sm') }), h('span', {}, it.label), h('small', {}, it.note));
    layer.append(el);
    return el;
  });
  layer.addEventListener('click', () => { layer.remove(); NovaMotion.emit('close'); });
  L.overlay.append(layer);
  NovaMotion.emit('open');

  els.forEach((el, i) => {
    const angle = items[i].angle;
    const dist = 108 + i * 6;
    setTimeout(() => {
      NovaMotion.spring({
        from: 0, to: 1, springName: 'ELASTIC',
        onUpdate: (v) => {
          const dx = Math.cos(angle) * dist * v - 30;
          const dy = Math.sin(angle) * dist * v - 22;
          el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${(0.7 + 0.3 * v).toFixed(3)})`;
          el.style.opacity = String(Math.min(1, v * 1.6));
        },
      });
    }, i * NovaMotion.stagger(60));
  });
}

/* ── gesture routing ───────────────────────────────────────────── */
const zoneEnabled = (zone) => {
  if (state.surface === 'lock') return zone === 'bottom' || zone === 'surface';
  if (zone === 'right') return state.surface === 'app' || state.surface === 'split' || state.surface === 'canvas';
  return true;
};

let dragIntent = null;

function onGestureStart(g) {
  if (state.surface === 'lock') { dragIntent = 'unlock'; return; }

  if (g.zone === 'right') {
    if (state.surface === 'canvas') { dragIntent = 'canvas-back'; return; }
    if (state.surface === 'app' && backBegin(g)) dragIntent = 'back';
    return;
  }
  if (g.zone === 'bottom') {
    dragIntent = state.panel === 'core' ? 'core-close' : 'core';
    if (dragIntent === 'core') { openPanelSilently('core'); ui.core.animateOrbit('commit', 0); }
    return;
  }
  if (g.zone === 'top') {
    dragIntent = state.panel === 'flow' ? 'flow-close' : 'flow';
    if (dragIntent === 'flow') openPanelSilently('flow');
    return;
  }
  if (g.zone === 'corner') { dragIntent = 'control'; return; }
  if (g.zone === 'surface') {
    if (state.surface === 'app') { dragIntent = 'collapse'; return; }
    if (state.panel) { dragIntent = state.panel === 'core' ? 'core-close' : 'flow-close'; return; }
    if (state.surface === 'home' && g.dy < 0) { dragIntent = 'core'; openPanelSilently('core'); return; }
    if (state.surface === 'home' && g.dy > 0) { dragIntent = 'flow'; openPanelSilently('flow'); return; }
  }
}

function openPanelSilently(name) {
  state.panel = name;
  if (name === 'flow') ui.flow.render();
}

function onGestureMove(g) {
  const H = screen.clientHeight;
  const W = screen.clientWidth;

  switch (dragIntent) {
    case 'unlock': {
      const p = clamp(-g.dy / (H * 0.42));
      ui.lock.progress(p);
      ui.home.root.style.opacity = String(0.2 + 0.8 * p);
      ui.home.root.style.transform = `scale(${(1.04 - 0.04 * p).toFixed(4)})`;
      break;
    }
    case 'back':
      backSet(-g.dx / (W * 0.62));
      break;
    case 'canvas-back':
      ui.canvas.el.style.transform = `translate3d(${(-g.dx * 0.5).toFixed(1)}px, 0, 0)`;
      ui.canvas.el.style.opacity = String(1 - clamp(-g.dx / 320) * 0.6);
      break;
    case 'core':
      panelCtl.core.set(clamp(-g.dy / (H * 0.5)));
      break;
    case 'core-close':
      panelCtl.core.set(clamp(1 - (g.dy / (H * 0.4))));
      break;
    case 'flow':
      panelCtl.flow.set(clamp(g.dy / (H * 0.42)));
      break;
    case 'flow-close':
      panelCtl.flow.set(clamp(1 - (-g.dy / (H * 0.4))));
      break;
    case 'control':
      setControlProgress(clamp(Math.hypot(g.dx, g.dy) / 200));
      break;
    case 'collapse': {
      if (g.dy < 0 || !appCtl) break;
      const p = clamp(g.dy / (H * 0.5));
      appCtl.el.style.transform = `translate3d(0, ${(p * (H * 0.35)).toFixed(1)}px, 0) scale(${(1 - p * 0.16).toFixed(4)})`;
      appCtl.el.style.borderRadius = `${(28 + p * 12).toFixed(1)}px`;
      break;
    }
    default: break;
  }
}

function onGestureEnd(g) {
  const H = screen.clientHeight;
  const W = screen.clientWidth;
  const intent = dragIntent;
  dragIntent = null;

  switch (intent) {
    case 'unlock': {
      const p = clamp(-g.dy / (H * 0.42));
      const commit = p > 0.3 || -g.vy > 700;
      if (commit) {
        state.surface = 'home';
        ui.lock.setVisible(false);
        ui.lock.progress(0);
        ui.home.root.style.opacity = '1';
        ui.home.root.style.transform = '';
        ui.home.enter();
        NovaMotion.emit('open');
        paintCaption();
      } else {
        NovaMotion.spring({ from: p, to: 0, springName: 'SOFT', onUpdate: (v) => ui.lock.progress(v) });
        ui.home.root.style.opacity = '0.2';
      }
      break;
    }
    case 'back': {
      const q = clamp(-g.dx / (W * 0.62));
      const commit = q > 0.34 || g.vx < -700;
      backEnd(commit, Math.abs(g.vx));
      break;
    }
    case 'canvas-back': {
      const q = clamp(-g.dx / 320);
      const commit = q > 0.32 || g.vx < -650;
      if (commit) hideCanvas();
      else {
        NovaMotion.spring({
          from: q, to: 0, springName: 'SOFT',
          onUpdate: (v) => {
            ui.canvas.el.style.transform = `translate3d(${(-v * 160).toFixed(1)}px, 0, 0)`;
            ui.canvas.el.style.opacity = String(1 - v * 0.6);
          },
        });
      }
      break;
    }
    case 'core': {
      const p = clamp(-g.dy / (H * 0.5));
      const commit = p > 0.34 || -g.vy > 700;
      panelCtl.core.release(commit ? 'commit' : 'cancel', Math.abs(g.vy));
      if (commit) { state.panel = 'core'; ui.core.animateOrbit('commit', 900); NovaMotion.emit('open'); }
      else { state.panel = null; ui.core.animateOrbit('cancel', 0); }
      paintCaption();
      break;
    }
    case 'core-close': {
      const q = clamp(1 - g.dy / (H * 0.4));
      const commit = q < 0.5 || g.vy > 700;
      if (commit) { closePanel(); }
      else { panelCtl.core.release('commit', 0); ui.core.animateOrbit('commit', 0); }
      break;
    }
    case 'flow': {
      const p = clamp(g.dy / (H * 0.42));
      const commit = p > 0.3 || g.vy > 700;
      panelCtl.flow.release(commit ? 'commit' : 'cancel', Math.abs(g.vy));
      state.panel = commit ? 'flow' : null;
      if (commit) NovaMotion.emit('open');
      paintCaption();
      break;
    }
    case 'flow-close': {
      const q = clamp(1 + g.dy / (H * 0.4));
      if (q < 0.5 || -g.vy > 700) closePanel();
      else panelCtl.flow.release('commit', 0);
      break;
    }
    case 'control': {
      const p = controlProgress;
      const inside = p > 0.45 || g.velocity > 900;
      if (inside) { state.panel = 'control'; setControlProgress(1); }
      else { state.panel = null; NovaMotion.spring({ from: p, to: 0, springName: 'SOFT', onUpdate: setControlProgress }); }
      paintCaption();
      break;
    }
    case 'collapse': {
      const p = clamp(g.dy / (H * 0.5));
      const commit = p > 0.32 || g.vy > 900;
      if (commit) collapseToCanvas();
      else if (appCtl) {
        const el = appCtl.el;
        NovaMotion.spring({
          from: p, to: 0, springName: 'SOFT',
          onUpdate: (v) => {
            el.style.transform = `translate3d(0, ${(v * (H * 0.35)).toFixed(1)}px, 0) scale(${(1 - v * 0.16).toFixed(4)})`;
            el.style.borderRadius = `${(28 + v * 12).toFixed(1)}px`;
          },
        });
      }
      break;
    }
    default: break;
  }
}

attachGestures(screen, {
  onStart: onGestureStart,
  onMove: onGestureMove,
  onEnd: onGestureEnd,
  isZoneEnabled: zoneEnabled,
});

/* lock: touch brings the tools in */
screen.addEventListener('pointerdown', () => { if (state.surface === 'lock') ui.lock.touched(); });

/* ── caption ───────────────────────────────────────────────────── */
function paintCaption() {
  const map = {
    lock: 'شاشة القفل · اسحب للأعلى للدخول',
    home: 'Dynamic Space · اسحب من الأسفل CORE · من الأعلى FLOW · من الزاوية CONTROL',
    app: 'تطبيق مفتوح · اسحب من الحافة اليمنى رجوع (تفاعلي) · اسحب لأسفل للتصغير إلى CANVAS',
    canvas: 'NOVA CANVAS · حرّك النوافذ · اسحبها خارج المساحة لإغلاقها',
    split: 'Split Flow · اسحب الفاصل — فيه نقاط توقف 25/50/75',
  };
  caption.innerHTML = map[state.surface] || '';
  statusbar.style.opacity = state.surface === 'lock' ? '0' : '1';
}

/* ── deck ──────────────────────────────────────────────────────── */
const deckActions = [
  ['event', 'حدث جديد'],
  ['media', 'تشغيل وسائط'],
  ['canvas', 'المساحة'],
  ['flow', 'FLOW'],
  ['core', 'CORE'],
  ['control', 'CONTROL'],
  ['settings', 'الإعدادات'],
  ['widgets', 'الودجات'],
  ['resume', 'استرجاع مساحة'],
  ['power', 'زر الطاقة'],
  ['privacy', 'الخصوصية'],
  ['aod', 'شاشة AOD'],
  ['lock', 'قفل الشاشة'],
  ['sweep', 'إغلاق جماعي'],
];

function buildInstallDeck() {
  const host = document.getElementById('deck-install');
  if (!host) return;
  host.replaceChildren(
    h('button', {
      class: 'chip chip--cta',
      onclick: () => { ui.install.isOpen ? ui.install.close() : ui.install.open(); },
    }, 'تحميل على الهاتف'),
    h('button', {
      class: 'chip',
      onclick: () => ui.install.open(),
    }, 'APK / PWA'),
  );
  const note = document.getElementById('install-note');
  if (note) {
    note.innerHTML = isStandalone()
      ? `شغّال كتطبيق مثبّت · <code>v${NOVA_VERSION}</code>`
      : `افتح «تحميل على الهاتف» للتثبيت كتطبيق أو تنزيل الـAPK · <code>v${NOVA_VERSION}</code>`;
  }
}

function buildDeck() {
  const chipRow = (id, entries, key, onPick) => {
    const row = document.getElementById(id);
    row.replaceChildren(...Object.entries(entries).map(([k, v]) => h('button', {
      class: 'chip',
      'aria-pressed': String(nova[key] === k),
      onclick: () => { onPick(k); refreshDeck(); },
    }, v.label)));
    return row;
  };

  window.__novaDeck = { chipRow };
  refreshDeck();

  document.getElementById('deck-actions').replaceChildren(...deckActions.map(([id, label]) => h('button', {
    class: 'chip', dataset: { action: id }, onclick: () => runAction(id),
  }, label)));

  buildInstallDeck();
}

function refreshDeck() {
  const chipRow = (id, entries, key, onPick) => {
    const row = document.getElementById(id);
    row.replaceChildren(...Object.entries(entries).map(([k, v]) => h('button', {
      class: 'chip',
      'aria-pressed': String(nova[key] === k),
      onclick: () => { onPick(k); refreshDeck(); },
    }, v.label)));
  };
  chipRow('chips-profile', PROFILES, 'profile', setProfile);
  chipRow('chips-theme', THEMES, 'theme', setTheme);
  chipRow('chips-mode', { dark: { label: 'NOVA Dark' }, light: { label: 'NOVA Paper' } }, 'mode', setMode);
  chipRow('chips-accent', ACCENTS, 'accent', setAccent);

  /* wallpaper scenes — the same picker lives inside تطبيق الإعدادات */
  const wallRow = document.getElementById('chips-wallpaper');
  if (wallRow) {
    wallRow.replaceChildren(...Object.entries(WALLPAPERS)
      .filter(([, w]) => !w.native || isNativeLauncher())
      .map(([id, w]) => h('button', {
        class: 'chip',
        'aria-pressed': String(wallpaperId() === id),
        onclick: () => { setWallpaper(id); },
      }, w.label)));
  }

  document.getElementById('profile-note').textContent = PROFILES[nova.profile].note;
  document.getElementById('theme-note').textContent = THEMES[nova.theme].note;
}

const uiStats = document.getElementById('stats');
setInterval(() => {
  if (!uiStats) return;
  const settle = springConfig('theme');
  uiStats.innerHTML = `
    <div class="stat"><b>${stats.fps}</b><span>FPS</span></div>
    <div class="stat"><b>${stats.active}</b><span>ANIMATIONS</span></div>
    <div class="stat"><b>${stats.worstFrame.toFixed(1)}ms</b><span>WORST FRAME</span></div>
    <div class="stat"><b>${Math.round(currentOvershoot() * 100)}%</b><span>OVERSHOOT</span></div>
    <div class="stat"><b>${blurPx()}px</b><span>BLUR BUDGET</span></div>
    <div class="stat"><b>${Math.round(hapticBudgetLeft())}</b><span>HAPTIC BUDGET</span></div>
    <div class="stat"><b>${token('NORMAL')}ms</b><span>NORMAL TOKEN</span></div>
    <div class="stat"><b>${stats.frameCount}</b><span>FRAMES</span></div>`;
}, 600);

function runAction(id) {
  switch (id) {
    case 'event': {
      const evt = makeEvent();
      const level = pushEvent(evt);
      if (state.panel === 'flow') ui.flow.render();
      toast(state.mediaPlaying ? 'الحدث وصل كـ Orb — مش هيقطع الوسائط' : 'وصل حدث جديد إلى NOVA FLOW');
      break;
    }
    case 'media':
      if (!state.mediaPlaying) {
        closePanel(true);
        openApp('music', ui.home.cardEl('music'));   // the app turns media state on
        toast('الوسائط شغالة — أي حدث جديد هيظهر كـ Orb');
      } else {
        state.mediaPlaying = false;
        toast('تم إيقاف الوسائط');
      }
      break;
    case 'canvas': closePanel(true); ui.canvas.render(); showCanvas(); break;
    case 'flow': openPanel('flow'); break;
    case 'core': openPanel('core'); break;
    case 'control': openPanel('control'); break;
    case 'widgets': {
      if (isNativeLauncher()) {
        try { window.NovaSystem.openWidgets(); } catch { /* ignore */ }
      } else {
        toast('الودجات متاحة داخل تطبيق NOVA على أندرويد');
      }
      break;
    }
    case 'resume': {
      const slots = [{ x: 22, y: 150 }, { x: 116, y: 382 }, { x: 30, y: 596 }];
      state.windows = state.lastWorkspace.slice(0, 3).map((appId, i) => ({ appId, x: slots[i].x, y: slots[i].y }));
      notify('windows');
      ui.canvas.render();
      showCanvas();
      toast('استرجاع آخر مساحة عمل — النظام بيفتكر مكان كل نافذة');
      break;
    }
    case 'power': powerMenu(screen.clientWidth * 0.5, screen.clientHeight * 0.45); break;
    case 'privacy':
      if (state.surface === 'lock') { state.surface = 'home'; ui.lock.setVisible(false); ui.home.setHidden(false); ui.home.enter(); }
      closePanel(true);
      openApp('privacy', ui.home.cardEl('notes'));
      break;
    case 'aod': {
      const showing = !ui.lock.aod.classList.contains('hidden');
      closePanel(true);
      state.surface = 'lock';
      ui.home.setHidden(false);
      ui.home.root.style.opacity = '0.3';
      ui.lock.aodVisible(!showing);
      ui.lock.progress(0);
      paintCaption();
      break;
    }
    case 'lock':
      closePanel(true);
      state.surface = 'lock';
      clear(L.apps); clear(L.split);
      appCtl = null; splitCtl = null; state.split = null; back = null;
      ui.home.setHidden(false);
      ui.home.root.style.opacity = '0.2';
      ui.home.root.style.transform = '';
      ui.lock.setVisible(true);
      ui.lock.aodVisible(false);
      ui.lock.progress(0);
      paintCaption();
      break;
    case 'sweep': showCanvas(); setTimeout(() => ui.canvas.sweep(), 320); break;
    case 'install': ui.install.isOpen ? ui.install.close() : ui.install.open(); break;
    case 'settings': case 'customize':
      if (state.surface === 'lock') {
        state.surface = 'home';
        ui.lock.setVisible(false);
        ui.home.setHidden(false);
        ui.home.enter();
      }
      closePanel(true);
      openApp('settings', null);
      break;
    default: break;
  }
}

/* ── keyboard shortcuts (desktop) ──────────────────────────────── */
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const map = { k: 'core', f: 'flow', c: 'canvas', e: 'event', m: 'media', p: 'power', l: 'lock', s: 'sweep', r: 'resume', i: 'install', w: 'settings' };
  const action = map[e.key.toLowerCase()];
  if (action) { e.preventDefault(); runAction(action); }
  if (e.key === 'Escape') NovaBack();
});

/* ── boot ──────────────────────────────────────────────────────── */
onConfigChange(() => { refreshDeck(); });
onWallpaperChange(() => { refreshDeck(); });

/* the install sheet can be summoned from داخل الإعدادات too */
window.addEventListener('nova:open-install', () => {
  try { ui.install.open(); } catch { /* ignore */ }
});

/* long-press the open space of Dynamic Space → customize (الإعدادات) */
try {
  let pressTimer = null;
  let sx = 0;
  let sy = 0;
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
  L.home.addEventListener('pointerdown', (e) => {
    if (state.surface !== 'home' || state.panel || appCtl) return;
    if (e.target?.closest?.('button, input, .app-card, .orb-item, .home__task, .home__banner')) return;
    sx = e.clientX; sy = e.clientY;
    cancelPress();
    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (state.surface === 'home' && !state.panel && !appCtl) {
        NovaMotion.emit('open');
        openApp('settings', null);
        toast('خصّص مساحتك: الخلفية · المظهر · الحركة');
      }
    }, 550);
  });
  L.home.addEventListener('pointermove', (e) => {
    if (pressTimer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancelPress();
  });
  L.home.addEventListener('pointerup', cancelPress);
  L.home.addEventListener('pointercancel', cancelPress);
} catch { /* ignore */ }

buildDeck();
state.surface = 'lock';
ui.home.setHidden(false);
ui.home.root.style.opacity = '0.2';
ui.home.enter();
paintCaption();

// A first event, so NOVA FLOW is never empty on first look
pushEvent(makeEvent({ who: 'محمد', body: 'عايز يكلمك', actions: ['رد', 'اتصال'] }));
pushEvent(makeEvent({ who: 'التقويم', body: 'اجتماع الفريق بعد 25 دقيقة', actions: ['تأجيل', 'افتح'] }));

/* ══════════════════════════════════════════════════════════════
   Shell detection — the APK (or an installed web app) hides the
   desktop scaffolding: the WebView *is* the device (styles/shell-android.css).
   `?shell=app` previews that layout in any browser.
   ══════════════════════════════════════════════════════════════ */
const params = new URLSearchParams(location.search);
const shellParam = params.get('shell');
const isShellApp = shellParam === 'app'
  || /NovaOS/i.test(navigator.userAgent)
  || (shellParam !== 'web' && isStandalone());
document.body.dataset.shell = isShellApp ? 'app' : 'web';
document.body.dataset.version = NOVA_VERSION;
// who is running us? the Android shell reports its own insets; an installed
// iOS web app has to ask the OS through env(safe-area-inset-*) instead
document.body.dataset.platform =
  /Android/i.test(navigator.userAgent) ? 'android'
    : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios'
      : 'other';

/* deep links from the manifest shortcuts: ?action=core|canvas */
const deepLink = params.get('action');
if (deepLink) {
  setTimeout(() => {
    if (state.surface === 'lock') {
      state.surface = 'home';
      ui.lock.setVisible(false);
      ui.home.setHidden(false);
      ui.home.enter();
    }
    runAction(deepLink);
  }, 240);
}

/* installable web app: real service worker + update flow */
registerServiceWorker().then((reg) => {
  if (reg) document.body.dataset.sw = 'ready';
});

window.addEventListener('nova:update-ready', () => {
  toast('تحديث NOVA جاهز — اضغط U للتطبيق أو أعد الفتح', 4200);
});
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'u' && !e.metaKey && !e.ctrlKey && e.target.tagName !== 'INPUT') applyUpdate();
});

toast(isShellApp ? `NOVA OS v${NOVA_VERSION}` : `NOVA OS v${NOVA_VERSION} — بروتوتايب المرحلة 1`, 3200);

/* ══════════════════════════════════════════════════════════════
   Boot splash — NOVA introduces itself, then dissolves with physics.
   ══════════════════════════════════════════════════════════════ */
(function bootSplash() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const hide = () => {
    NovaMotion.spring({
      from: 0, to: 1, springName: 'SOFT',
      onUpdate: (v) => {
        boot.style.opacity = String(1 - v);
        boot.style.transform = `scale(${(1 + v * 0.08).toFixed(3)})`;
        boot.style.filter = v > 0.02 ? `blur(${(v * 10).toFixed(1)}px)` : '';
      },
      onDone: () => boot.remove(),
    });
  };
  // the bar fills via CSS; physics takes over for the exit
  setTimeout(hide, 1050);
})();

/* wallpaper parallax — the living layer breathes with the pointer */
try {
  let px = 0; let py = 0;
  screen.addEventListener('pointermove', (e) => {
    if (!fx) return;
    try {
      const r = screen.getBoundingClientRect();
      px = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
      py = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2;
      fx.setParallax(px, py);
    } catch { /* ignore */ }
  });
  screen.addEventListener('pointerleave', () => { try { fx?.setParallax(0, 0); } catch { /* ignore */ } });
} catch { /* ignore */ }

/* theme changes repaint the living layer */
onConfigChange(() => { try { fx?.refresh(); } catch { /* ignore */ } });

/* ══════════════════════════════════════════════════════════════
   Native shell hooks — the APK talks back through these.
   ══════════════════════════════════════════════════════════════ */
window.NovaOnNotifications = (payload) => {
  try {
    window.__novaLive = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch { window.__novaLive = []; }
  window.dispatchEvent(new CustomEvent('nova:live'));
  // a live event while media plays becomes an orb, never an interruption
  if (state.mediaPlaying && !state.orb && window.__novaLive?.length && !ui.orb.active) {
    const n = window.__novaLive[0];
    state.orb = { event: makeEvent({ who: n.app || 'الهاتف', body: n.title || n.text || '', actions: ['فتح', 'لاحقًا'], liveKey: n.key }) };
    notify('events');
  }
};

window.NovaOnAppsChanged = () => {
  window.dispatchEvent(new CustomEvent('NovaOnAppsChanged'));
  try {
    if (state.surface === 'home' && !appCtl) ui.home.refresh();
  } catch { /* ignore */ }
};

window.NovaOnPermission = (granted) => {
  if (granted) {
    try { ui.setup?.refresh(); } catch { /* ignore */ }
    toast('تم منح الإذن');
  }
};

/* tapping NOVA's own icon (or Home) while it runs = go home inside NOVA */
window.NovaGoHome = () => {
  if (ui.setup?.isOpen || ui.install?.isOpen) return true;
  if (state.panel) closePanel(true);
  if (state.surface === 'split' && splitCtl) { closeSplit(); return true; }
  if (appCtl) { finishApp('home'); return true; }
  if (state.surface === 'canvas') { hideCanvas(); return true; }
  if (state.surface === 'lock') return false;
  ui.home.enter();
  return true;
};

/* nova:// deep links: core | flow | canvas | control | app/<id> */
window.NovaOnRoute = (route) => {
  try {
    if (state.surface === 'lock') {
      state.surface = 'home';
      ui.lock.setVisible(false);
      ui.home.setHidden(false);
      ui.home.enter();
    }
    const r = String(route || '');
    if (r === 'core' || r === 'flow' || r === 'control') openPanel(r);
    else if (r === 'canvas') { closePanel(true); showCanvas(); }
    else if (r.startsWith('app/')) openApp(r.slice(4), null);
    else if (r === 'setup') ui.setup?.open();
  } catch { /* ignore */ }
};

/* first run in the APK: the wizard turns NOVA into the phone */
if (isNativeLauncher()) {
  setTimeout(() => {
    try {
      if (ui.setup?.shouldAutoShow()) {
        if (state.surface === 'lock') {
          state.surface = 'home';
          ui.lock.setVisible(false);
          ui.home.setHidden(false);
          ui.home.enter();
          paintCaption();
        }
        ui.setup.open();
      }
    } catch { /* ignore */ }
  }, 1400);
}

/* ══════════════════════════════════════════════════════════════
   NovaBack — one navigation answer, used by three shells:
     · the APK's hardware/gesture back button (MainActivity.kt)
     · the Android browser's back in an installed web app (popstate)
     · the desktop Esc key
   Returns true when NOVA consumed the step.
   ══════════════════════════════════════════════════════════════ */
function NovaBack() {
  if (ui.setup?.isOpen) { ui.setup.close(); return true; }
  if (ui.install?.isOpen) { ui.install.close(); return true; }
  if (ui.core?.closePop?.()) return true;   // an app's long-press popup closes first
  const power = document.querySelector('.power');
  if (power) { power.remove(); NovaMotion.emit('close'); return true; }
  if (state.panel) { closePanel(); return true; }
  if (state.surface === 'split') { closeSplit(); return true; }
  // Back = the surface you came from (docs/01 §5). Collapsing an app into a
  // memory card on NOVA CANVAS is the drag-down gesture, not Back.
  if (state.surface === 'app') { finishApp(returnTo === 'canvas' ? 'canvas' : 'home'); return true; }
  if (state.surface === 'canvas') { hideCanvas(); return true; }
  return false;
}

/* an installed web app must answer the system back gesture too */
if (isShellApp) {
  history.pushState({ nova: true }, '');
  window.addEventListener('popstate', () => {
    if (NovaBack()) history.pushState({ nova: true }, '');
  });
}

/* the APK downloads and installs the update itself; the browser just downloads */
window.NovaOnInstall = (state) => {
  if (state === 'ready') toast('نزّلنا الملف — اكمل التثبيت من نافذة النظام', 3600);
  else toast('افتح لينك التحميل من المتصفح لإكمال التثبيت', 3600);
};

window.NovaBack = NovaBack;
window.NOVA = {
  state, ui, openApp, openPanel, closePanel, showCanvas, runAction, toast, NovaMotion,
  version: NOVA_VERSION, install: ui.install, setup: ui.setup, fx,
  checkForUpdate, applyUpdate, isStandalone,
  wallpaper: { set: setWallpaper, id: wallpaperId, all: WALLPAPERS },
  back: NovaBack, goHome: window.NovaGoHome,
};
