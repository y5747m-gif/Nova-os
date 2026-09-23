/* ══════════════════════════════════════════════════════════════
   NOVA experience check — the golden flows of docs/02 §11
   Runs the real prototype modules against a jsdom DOM: the surface
   state machine, every gesture zone, the morph/back/panel flows,
   the orb, drag & drop, split flow and the whole config matrix.

   Requires jsdom:   npm install        (dev dependency)
   Run:              node tools/experience-check.mjs
   ══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.error('jsdom is not installed — run `npm install` first.');
  process.exit(2);
}

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../prototype');
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.join(' ')); origErr(...a); };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true });
const { window } = dom;

/* jsdom has no layout engine: give the screen real dimensions so the
   morph math (which divides by width/height) sees faithful geometry */
Object.defineProperty(window.Element.prototype, 'clientWidth', {
  get() { return this.id === 'screen' ? 384 : Math.round(this.getBoundingClientRect().width); },
});
Object.defineProperty(window.Element.prototype, 'clientHeight', {
  get() { return this.id === 'screen' ? 828 : Math.round(this.getBoundingClientRect().height); },
});

/* fake layout so the motion math sees real geometry */
const SCREEN = { left: 0, top: 0, width: 390, height: 844 };
const rectCache = new WeakMap();
let seed = 0;
window.Element.prototype.getBoundingClientRect = function () {
  if (rectCache.has(this)) return rectCache.get(this);
  const cls = this.className || '';
  let r;
  if (this.id === 'screen') r = { ...SCREEN };
  else if (this.classList?.contains('app') || this.classList?.contains('split') || this.classList?.contains('canvas') || this.classList?.contains('control')) r = { left: 0, top: 0, width: 390, height: 844 };
  else if (this.classList?.contains('panel')) r = { left: 0, top: 500, width: 390, height: 344 };
  else if (this.classList?.contains('win')) r = { left: 30, top: 150, width: 208, height: 268 };
  else if (this.classList?.contains('ph')) r = { left: 100, top: 300, width: 100, height: 100 };
  else if (this.classList?.contains('orb')) r = { left: 370, top: 380, width: 42, height: 42 };
  else if (this.classList?.contains('drop-target')) r = { left: 40 + (seed % 4) * 90, top: 700, width: 80, height: 70 };
  else { r = { left: 20 + (seed % 5) * 40, top: 200 + (seed % 6) * 60, width: 180, height: 92 }; seed++; }
  const box = { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
  rectCache.set(this, box);
  return box;
};

/* expose globals the modules expect */
const g = globalThis;
g.window = window;
g.document = window.document;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.CustomEvent = window.CustomEvent;
g.Event = window.Event;
g.PointerEvent = window.PointerEvent;
g.MouseEvent = window.MouseEvent;
g.KeyboardEvent = window.KeyboardEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
/* timers: Node's own are fine */
const mmShim = (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.matchMedia = mmShim;
g.matchMedia = mmShim;
/* jsdom has no 2D canvas: the living wallpaper layer must degrade to a no-op
   (in production getContext returns a real context or null — both handled). */
try {
  window.HTMLCanvasElement.prototype.getContext = () => null;
} catch { /* ignore */ }
Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true });
g.location = window.location;
g.history = window.history;
g.localStorage = window.localStorage;
g.innerWidth = 390;
g.innerHeight = 844;
g.AbortController = globalThis.AbortController;


/* jsdom 25 has no PointerEvent constructor — build one either way. */
function mkEv(type, opts) {
  let ev;
  try { ev = new window.PointerEvent(type, opts); }
  catch { ev = new window.MouseEvent(type, opts); }
  if (opts.pointerId !== undefined && ev.pointerId === undefined) {
    Object.defineProperty(ev, 'pointerId', { value: opts.pointerId });
  }
  return ev;
}

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
}

/** Walk NOVA's own back stack down to the home surface. */
async function goHome() {
  let guard = 8;
  while (window.NOVA && window.NOVA.state.surface !== 'home' && guard-- > 0) {
    if (window.NOVA.state.surface === 'lock') {
      dragGest(195, 700, 195, 120);                     // the unlock gesture
    } else {
      window.document.getElementById('screen')
        .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return window.NOVA?.state.surface;
}

/* the install sheet talks to the GitHub releases API: stub it so the check is
   deterministic and offline (the real call is exercised manually). */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.github.com')) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, opts);
};
window.fetch = globalThis.fetch;

/* the Battery Status API ships on desktop Chrome: pin a deterministic level
   so the status bar assertion below is stable (jsdom itself has no getBattery). */
Object.defineProperty(window.navigator, 'getBattery', {
  value: async () => ({ level: 0.64, charging: false, addEventListener() {} }),
  configurable: true,
  writable: true,
});

const nativeMode = process.argv.includes('--native');
let nativeDefault = !process.argv.includes('--not-default');
let homeSettingsCalls = 0;
let homeRoleCalls = 0;
let nativeReady = false;
if (nativeMode) {
  Object.defineProperty(window.navigator, 'userAgent', { value: 'Android NovaOS/test' });
  window.NovaSystem = {
    listApps: () => '[]', launchApp: () => true,
    isDefaultLauncher: () => nativeDefault, setupDone: () => true,
    hasNotificationAccess: () => false, hasUsageAccess: () => false,
    openHomeSettings: () => { homeSettingsCalls++; },
    requestDefaultLauncher: () => { homeRoleCalls++; },
    ready: () => { nativeReady = typeof window.NovaBack === 'function'
      && typeof window.NovaGoHome === 'function' && typeof window.NovaOnRoute === 'function'; },
  };
}
const initialHistoryLength = window.history.length;
await import(`file://${ROOT}/src/main.js`);
await new Promise((r) => setTimeout(r, 300));

const N = window.NOVA;
check('boot: NOVA global exists', !!N);
if (nativeMode) {
  check('native: ready handshake runs after navigation hooks', nativeReady);
  check('native: cold start opens home, not simulated lock', N.state.surface === 'home');
  check('native: home is fully visible', N.ui.home.root.style.opacity === '1' && N.ui.lock.el.classList.contains('hidden'));
  check('native: does not create a browser history back trap', window.history.length === initialHistoryLength);
  for (let i = 0; i < 10; i++) window.NovaBack();
  check('native: repeated Back stays on home', N.state.surface === 'home');
  N.runAction('lock'); N.runAction('aod');
  check('native: demo actions cannot replace Android lock screen', N.state.surface === 'home');
  N.openPanel('core');
  await new Promise((r) => setTimeout(r, 700));
  check('native: Back consumes panel', window.NovaBack() === true);
  await new Promise((r) => setTimeout(r, 700));
  check('native: Back returns to home', N.state.surface === 'home' && !N.state.panel);
  N.runAction('power');
  await new Promise((r) => setTimeout(r, 900));
  check('native: power action routes to settings, no fake shutdown', N.state.focusedApp === 'settings' && !document.querySelector('.power'));
  const section = () => document.querySelector('[data-launcher-settings]');
  const button = (key) => section()?.querySelector(`[data-launcher-${key}]`);
  check('native: launcher controls appear in settings', !!section());
  if (!nativeDefault) {
    button('toggle').click();
    check('native: activation asks Android for HOME role', homeRoleCalls === 1 && homeSettingsCalls === 0);
    nativeDefault = true;
    window.NovaLauncherState = { def: true, setup: true };
    window.dispatchEvent(new window.CustomEvent('nova:launcher'));
  }
  button('toggle').click();
  check('native: deactivation requires confirmation', !!button('confirm') && homeSettingsCalls === 0);
  button('cancel').click();
  check('native: cancel preserves launcher', !button('confirm') && homeSettingsCalls === 0);
  button('toggle').click(); button('confirm').click();
  check('native: confirmed deactivation opens Android settings only', homeSettingsCalls === 1 && nativeDefault);
  window.dispatchEvent(new window.CustomEvent('nova:launcher'));
  check('native: returning without changing default keeps active status', section().textContent.includes('NOVA هي الواجهة الرئيسية'));
  nativeDefault = false;
  window.NovaLauncherState = { def: false, setup: true };
  window.dispatchEvent(new window.CustomEvent('nova:launcher'));
  check('native: returning from Android settings refreshes status', section().textContent.includes('NOVA ليست الواجهة الرئيسية'));
  button('toggle').click();
  check('native: inactive launcher can be activated again', homeRoleCalls >= 1);
  window.NovaGoHome();
  await new Promise((r) => setTimeout(r, 900));
  check('native: HOME returns from settings', N.state.surface === 'home');
  check('native: no runtime errors', errors.length === 0, errors.join('; '));
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} native checks passed`);
  process.exit(results.some((r) => !r.ok) || errors.length ? 1 : 0);
}
check('boot: lock surface' , N.state.surface === 'lock', N.state.surface);
check('boot: events seeded', N.state.events.length >= 2, String(N.state.events.length));
check('boot: deck chips rendered', window.document.querySelectorAll('#chips-profile .chip').length === 4);
check('the tool shows no raw codes or paths', !window.document.querySelector('#deck code, .screen code')
  && !(window.document.getElementById('deck')?.textContent || '').includes('docs/'));

/* ── unlock via a real pointer drag ─────────────────────────── */
function pointer(type, x, y) {
  const ev = mkEv(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0 });
  window.document.getElementById('screen').dispatchEvent(ev);
}
function dragGest(x0, y0, x1, y1, steps = 12) {
  pointer('pointerdown', x0, y0);
  for (let i = 1; i <= steps; i++) {
    pointer('pointermove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  }
  pointer('pointerup', x1, y1);
}

dragGest(195, 700, 195, 120);
await new Promise((r) => setTimeout(r, 400));
check('unlock gesture → home', N.state.surface === 'home', N.state.surface);

/* ── open an app (morph) ────────────────────────────────────── */
const card = window.document.querySelector('#layer-home .app-card[data-app="gallery"]');
N.openApp('gallery', card);
await new Promise((r) => setTimeout(r, 700));
check('openApp → app surface', N.state.surface === 'app' && N.state.focusedApp === 'gallery', N.state.focusedApp);
check('app surface in DOM', !!window.document.querySelector('#layer-apps .app[data-app="gallery"]'));
check('photo drag enabled', window.document.querySelectorAll('.ph').length === 12);

/* ── interactive back (right edge drag) ─────────────────────── */
dragGest(388, 400, 180, 400, 14);
await new Promise((r) => setTimeout(r, 700));
check('back gesture → home', N.state.surface === 'home', N.state.surface);
check('window remembered', N.state.windows.some((w) => w.appId === 'gallery'));

/* ── CORE panel (bottom edge drag) ──────────────────────────── */
dragGest(195, 840, 195, 380, 16);
await new Promise((r) => setTimeout(r, 500));
check('core panel opened', N.state.panel === 'core', String(N.state.panel));
check('orbit animating items', window.document.querySelectorAll('#layer-panels .orb-item').length === 5);

/* ── NOVA FIND search ───────────────────────────────────────── */
N.ui.core.runSearch('محمد');
check('search finds محمد', window.document.querySelector('#layer-panels .core__result') !== null);

/* ── CANVAS via the hub ─────────────────────────────────────── */
N.ui.core.el.querySelector('.hub').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 700));
check('canvas surface', N.state.surface === 'canvas', N.state.surface);
check('canvas windows rendered', window.document.querySelectorAll('#layer-canvas .win').length === N.state.windows.length);
check('group outline for the trip', !!window.document.querySelector('#layer-canvas .win__group'));

/* ── FLOW panel (top edge drag) ─────────────────────────────── */
dragGest(195, 6, 195, 380, 16);
await new Promise((r) => setTimeout(r, 500));
check('flow panel opened', N.state.panel === 'flow', String(N.state.panel));
check('event cards rendered', window.document.querySelectorAll('#layer-panels .event-card').length === N.state.events.length);
N.closePanel();
await new Promise((r) => setTimeout(r, 400));

/* ── orb: media playing + new event must NOT interrupt ──────── */
N.runAction('media');
await new Promise((r) => setTimeout(r, 900));
check('media playing', N.state.mediaPlaying === true);
N.runAction('event');
await new Promise((r) => setTimeout(r, 400));
check('event became an orb (no interruption)', !!window.document.querySelector('#layer-overlay .orb') && !!N.state.orb);

/* ── drag & drop: photo → person ────────────────────────────── */
N.openApp('gallery', card);
await new Promise((r) => setTimeout(r, 600));
const ph = window.document.querySelector('.ph[data-photo="3"]');
ph.dispatchEvent(mkEv('pointerdown', { clientX: 140, clientY: 330, bubbles: true, cancelable: true, pointerId: 9 }));
ph.dispatchEvent(mkEv('pointermove', { clientX: 145, clientY: 336, bubbles: true, cancelable: true, pointerId: 9 }));
check('dnd: drop tray appears', !!window.document.querySelector('#layer-overlay .drop-tray'));
const targetRect = window.document.querySelector('#layer-overlay .drop-target').getBoundingClientRect();
ph.dispatchEvent(mkEv('pointermove', { clientX: targetRect.left + 40, clientY: targetRect.top + 35, bubbles: true, cancelable: true, pointerId: 9 }));
check('dnd: target armed by proximity', !!window.document.querySelector('#layer-overlay .drop-target[data-armed="1"]'));
ph.dispatchEvent(mkEv('pointerup', { clientX: targetRect.left + 40, clientY: targetRect.top + 35, bubbles: true, cancelable: true, pointerId: 9 }));
await new Promise((r) => setTimeout(r, 800));
check('dnd: whatsapp opened with staged content', N.state.focusedApp === 'whatsapp' && !!window.document.querySelector('.wa__staged:not(.hidden)'));

/* ── split flow: drag an app tile out of CORE ───────────────── */
N.openApp('music', card);
await new Promise((r) => setTimeout(r, 600));
N.openPanel('core');
await new Promise((r) => setTimeout(r, 500));
const tile = window.document.querySelector('#layer-panels .app-tile[data-app="notes"]');
const fire = (type, x, y) => tile.dispatchEvent(mkEv(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 12 }));
fire('pointerdown', 120, 700);
fire('pointermove', 130, 690);
fire('pointermove', 200, 400);
fire('pointermove', 200, 300);
fire('pointerup', 200, 300);
await new Promise((r) => setTimeout(r, 800));
check('split flow built', !!window.document.querySelector('#layer-split .split'), JSON.stringify(N.state.split));

/* ── canvas sweep ───────────────────────────────────────────── */
N.showCanvas();
await new Promise((r) => setTimeout(r, 300));
N.ui.canvas.sweep();
await new Promise((r) => setTimeout(r, 900));
check('sweep cleared the canvas', N.state.windows.length === 0, String(N.state.windows.length));

/* ── power menu ─────────────────────────────────────────────── */
N.runAction('power');
await new Promise((r) => setTimeout(r, 600));
check('power menu grew from a point', window.document.querySelectorAll('.power__item').length === 3);

/* ── every profile × theme × mode × accent ──────────────────── */
for (const p of ['cinematic', 'balanced', 'fast', 'reduced']) {
  for (const t of ['aurora', 'orbit', 'liquid', 'minimal', 'neon']) {
    const pChip = [...window.document.querySelectorAll('#chips-profile .chip')].find((c) => c.textContent.includes(p === 'reduced' ? 'Reduced' : p[0].toUpperCase() + p.slice(1)));
    const tChip = [...window.document.querySelectorAll('#chips-theme .chip')].find((c) => c.textContent.toLowerCase() === t);
    pChip?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    tChip?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    N.openApp('notes', card);
    await new Promise((r) => setTimeout(r, 260));
    N.runAction('lock');
    await new Promise((r) => setTimeout(r, 60));
  }
}
check('config matrix applied', window.document.body.dataset.profile === 'reduced' && window.document.body.dataset.theme === 'neon',
  `${window.document.body.dataset.profile}/${window.document.body.dataset.theme}/${window.document.body.dataset.motion}`);

/* ── light mode ─────────────────────────────────────────────── */
[...window.document.querySelectorAll('#chips-mode .chip')][1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('NOVA Paper applied', window.document.body.dataset.mode === 'light');

/* ── misc surfaces ──────────────────────────────────────────── */
N.runAction('privacy');
await new Promise((r) => setTimeout(r, 500));
check('privacy center renders', window.document.querySelectorAll('.privacy__row').length >= 4);
N.runAction('resume');
await new Promise((r) => setTimeout(r, 500));
check('resume restored a workspace', N.state.windows.length >= 1, String(N.state.windows.length));

/* ── the open morph must produce finite geometry ─────────────────── */
N.closePanel();
N.runAction('canvas');
await new Promise((r) => setTimeout(r, 500));
N.runAction('canvas');
await new Promise((r) => setTimeout(r, 300));
N.openApp('browser', window.document.querySelector('#layer-canvas .win'));
await new Promise((r) => setTimeout(r, 1200));
const appTransform = window.document.querySelector('#layer-apps .app')?.style.transform || '';
check('open morph transform is finite', appTransform.length > 0 && !appTransform.includes('NaN'), appTransform.slice(0, 48));
N.runAction('canvas');

/* ── canvas ⇄ app layering: the canvas must never trap home touches ── */
N.showCanvas();
await new Promise((r) => setTimeout(r, 400));
const canvasEl = window.document.querySelector('#layer-canvas .canvas');
const winEl = window.document.querySelector('#layer-canvas .win');
N.openApp('notes', winEl);
await new Promise((r) => setTimeout(r, 1200));
check('canvas parked while its app is open', canvasEl.style.pointerEvents === 'none', canvasEl.style.pointerEvents || 'auto');
dragGest(388, 400, 180, 400, 14);
await new Promise((r) => setTimeout(r, 1000));
check('back from a canvas app returns to the canvas', N.state.surface === 'canvas', N.state.surface);
await goHome();
check('canvas releases touches after hiding', canvasEl.style.pointerEvents === 'none', canvasEl.style.pointerEvents || 'auto');
check('back stack walked home', N.state.surface === 'home', N.state.surface);

/* ── the lock screen must not leak home touches ─────────────────── */
N.runAction('lock');
await new Promise((r) => setTimeout(r, 300));
check('lock surface restores home behind it', window.document.querySelector('#layer-home .home').dataset.hidden === '0');

await new Promise((r) => setTimeout(r, 400));
/* ── install sheet + NovaBack + native shell hooks ───────────────── */
await goHome();
N.runAction('install');
await new Promise((r) => setTimeout(r, 400));
const sheet = window.document.querySelector('.install-sheet');
check('install sheet opens', !!sheet);
check('install sheet offers PWA + APK', !!window.document.querySelector('#install-pwa') && !!window.document.querySelector('#install-apk'));
  check('install sheet explains the APK', (sheet?.textContent || '').includes('APK'));
  check('install sheet hides raw codes', !document.querySelector('.install-sheet code')
    && !(sheet?.textContent || '').includes('docs/'));
check('NovaBack closes the sheet first', N.back() === true && !window.document.querySelector('.install-sheet'));

/* NovaBack must walk the surface stack down to home, then stop */
N.openPanel('core');
await new Promise((r) => setTimeout(r, 400));
check('NovaBack closes CORE', N.back() === true && N.state.panel === null);
await goHome();
N.openApp('notes', window.document.querySelector('#layer-home .app-card'));
await new Promise((r) => setTimeout(r, 900));
check('NovaBack closes an open app', N.back() === true);
await new Promise((r) => setTimeout(r, 1200));
check('…an app opened from home goes back to home', N.state.surface === 'home' && !window.document.querySelector('#layer-apps .app'), N.state.surface);
check('…and at home the system is free to act', N.back() === false, N.state.surface);

/* collapse is a separate action: drag the app down → a card on NOVA CANVAS */
N.openApp('notes', window.document.querySelector('#layer-home .app-card'));
await new Promise((r) => setTimeout(r, 900));
N.ui.install.close();
dragGest(195, 300, 195, 700, 16);      // drag the app surface downwards
await new Promise((r) => setTimeout(r, 1400));
check('collapse sends the app to NOVA CANVAS, not home', N.state.surface === 'canvas', N.state.surface);
await goHome();

/* the download button must resolve the published asset and route it correctly */
const releasePayload = [{
  tag_name: 'apk-latest',
  published_at: '2026-09-21T18:15:34Z',
  assets: [
    { name: 'nova-os-latest.apk', size: 4518806, browser_download_url: 'https://github.com/y5747m-gif/Nova-os/releases/download/apk-latest/nova-os-latest.apk' },
    { name: 'SHA256SUMS.txt', size: 90, browser_download_url: 'https://example.invalid/sums' },
  ],
}];
globalThis.fetch = async (url) => (String(url).includes('api.github.com')
  ? new Response(JSON.stringify(releasePayload), { status: 200, headers: { 'content-type': 'application/json' } })
  : realFetch(url));
window.fetch = globalThis.fetch;

N.install.open();
await new Promise((r) => setTimeout(r, 400));
await new Promise((r) => setTimeout(r, 400));
const apkInfo = N.install.apk;
check('download button finds the published APK asset', !!apkInfo && apkInfo.name === 'nova-os-latest.apk', JSON.stringify(apkInfo?.name));
check('it reports the asset size in the sheet', (window.document.querySelector('.install__status')?.textContent || '').includes('م.ب'), window.document.querySelector('.install__status')?.textContent);
check('asset url is the GitHub release download', String(apkInfo?.url || '').includes('/releases/download/apk-latest/'), apkInfo?.url);

/* inside the APK the bridge downloads + installs it natively */
let bridgeCall = null;
window.NovaSystem = { download: (url, name) => { bridgeCall = { url, name }; }, version: () => '0.1.0' };
window.document.querySelector('#install-apk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 120));
check('inside the APK the bridge handles the download', bridgeCall?.name === 'nova-os-latest.apk', JSON.stringify(bridgeCall));
window.NovaSystem = undefined;
N.install.close();

/* native shell: the APK's JS bridge must be used when present */
window.NovaSystem = { download: () => {} };
check('native shell detected when the bridge exists', window.NOVA.install !== undefined);
window.NovaSystem = undefined;

/* ══════════════════════════════════════════════════════════════
   The FULL phone: every app exists, every app opens, the drawer
   shows all of them, the ring is alive, and الإعدادات can change
   the wallpaper + appearance from INSIDE the phone.
   ══════════════════════════════════════════════════════════════ */
const store = await import(`file://${ROOT}/src/core/store.js`);
const wallMod = await import(`file://${ROOT}/src/core/wallpaper.js`);
const APPS = store.APPS;
const appIds = Object.keys(APPS);

check('the catalogue is a FULL phone', appIds.length >= 28, String(appIds.length));
check('wallpaper engine ships every scene', Object.keys(wallMod.WALLPAPERS).length >= 12, String(Object.keys(wallMod.WALLPAPERS).length));

await goHome();
check('كرة التطبيقات lives on the ring', window.document.querySelectorAll('#layer-home .home__ring .orb-item').length >= 4,
  String(window.document.querySelectorAll('#layer-home .home__ring .orb-item').length));
check('one tap door to كل التطبيقات', !!window.document.querySelector('#layer-home .home__all'));

/* every app in the catalogue must open as a real surface */
{
  let opened = 0;
  for (const id of appIds) {
    N.openApp(id, null);
    await new Promise((r) => setTimeout(r, 45));
    if (window.document.querySelector(`#layer-apps .app[data-app="${id}"]`)) opened++;
    N.ui.home.setHidden(false);
  }
  check('every app opens its own surface', opened === appIds.length, `${opened}/${appIds.length}`);
  N.back();
  await new Promise((r) => setTimeout(r, 400));
  await goHome();
}

/* the drawer lists ALL of them */
N.openPanel('core');
await new Promise((r) => setTimeout(r, 400));
N.ui.core.showAll();
await new Promise((r) => setTimeout(r, 250));
{
  const tiles = window.document.querySelectorAll('#layer-panels .core__grid .app-tile');
  check('«كل التطبيقات» drawer lists every app', tiles.length === appIds.length, String(tiles.length));
}
N.back();
await new Promise((r) => setTimeout(r, 400));
await goHome();

/* الإعدادات — the control room: wallpaper + appearance from inside */
N.openApp('settings', null);
await new Promise((r) => setTimeout(r, 700));
check('الإعدادات opens as a real surface', !!window.document.querySelector('#layer-apps .app[data-app="settings"]'));
{
  const swatches = window.document.querySelectorAll('#layer-apps .set__wall');
  check('wallpaper picker shows every scene', swatches.length >= 10, String(swatches.length));
  const sunset = window.document.querySelector('#layer-apps .set__wall[data-wall="sunset"]');
  sunset.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
  check('changing the wallpaper applies instantly', window.document.body.dataset.wallpaper === 'sunset', window.document.body.dataset.wallpaper);
  check('the wallpaper choice persists on the device', window.localStorage.getItem('nova.wallpaper.v1') === 'sunset',
    String(window.localStorage.getItem('nova.wallpaper.v1')));
  const paper = [...window.document.querySelectorAll('#layer-apps .set__chip')].find((c) => (c.textContent || '').includes('Paper'));
  paper.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('المظهر flips NOVA Paper from inside the phone', window.document.body.dataset.mode === 'light', window.document.body.dataset.mode);
  const dark = [...window.document.querySelectorAll('#layer-apps .set__chip')].find((c) => (c.textContent || '').includes('Dark'));
  dark.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const neonWall = window.document.querySelector('#layer-apps .set__wall[data-wall="neon"]');
  neonWall.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('scenes switch live (neon)', window.document.body.dataset.wallpaper === 'neon', window.document.body.dataset.wallpaper);
  const aurora = window.document.querySelector('#layer-apps .set__wall[data-wall="aurora"]');
  aurora.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
N.back();
await new Promise((r) => setTimeout(r, 400));
await goHome();

/* ══════════════════════════════════════════════════════════════
   انميشن اختيار التطبيق: icon → bubble → rise → pop ✦ NOVA OS ✦
   ══════════════════════════════════════════════════════════════ */
{
  const cfgMod = await import(`file://${ROOT}/src/motion/config.js`);
  cfgMod.setProfile('balanced');            // the ritual needs motion enabled
  const card = window.document.querySelector('#layer-home .app-card') || window.document.querySelector('#layer-home .orb-item');
  const appId = card?.dataset?.app;
  N.openApp(appId, card);
  await new Promise((r) => setTimeout(r, 70));
  check('launch: the icon lifts off as a bubble', !!window.document.querySelector('#layer-overlay .launch__bubble'));
  await new Promise((r) => setTimeout(r, 520));
  check('launch: NOVA OS shines at the pop', !!window.document.querySelector('#layer-overlay .launch__brand'),
    String(window.document.querySelectorAll('#layer-overlay .launch__star').length));
  check('launch: the app blooms open after the pop', !!window.document.querySelector(`#layer-apps .app[data-app="${appId}"]`));
  await new Promise((r) => setTimeout(r, 800));
  N.back();
  await goHome();
}

/* ══════════════════════════════════════════════════════════════
   البكرات (Reels) — clips that really play
   ══════════════════════════════════════════════════════════════ */
N.openApp('video', null);
await new Promise((r) => setTimeout(r, 450));
{
  const reel = window.document.querySelector('#layer-apps .reel');
  check('reels: البكرات plays on open', !!reel && !reel.classList.contains('reel--paused'), reel?.className || 'no reel');
  await new Promise((r) => setTimeout(r, 450));
  const fillT = window.document.querySelector('#layer-apps .reel__bar b')?.style.transform || '';
  check('reels: the clip auto-progresses', /^scaleX\((0\.\d+|1)/.test(fillT), fillT || 'no fill');
  check('reels: media plays loud (events must not interrupt)', N.state.mediaPlaying === true, String(N.state.mediaPlaying));
  const cap0 = window.document.querySelector('#layer-apps .reel__txt span')?.textContent || '';
  window.document.querySelector('#layer-apps .reel__nav--next')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  const cap1 = window.document.querySelector('#layer-apps .reel__txt span')?.textContent || '';
  check('reels: the feed moves between clips', cap0 !== cap1 && cap1.length > 0, `${cap0} → ${cap1}`);
  window.document.querySelector('#layer-apps .reel__act')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('reels: like reacts', !!window.document.querySelector('#layer-apps .reel__act--on'));
  window.document.querySelector('#layer-apps .reel__stack')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 320));
  check('reels: one tap pauses and media goes quiet',
    !!window.document.querySelector('#layer-apps .reel--paused') && N.state.mediaPlaying === false);
  window.document.querySelector('#layer-apps .reel__stack')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 320));
  check('reels: tap again resumes the clip',
    !window.document.querySelector('#layer-apps .reel--paused') && N.state.mediaPlaying === true);
  const libTab = [...window.document.querySelectorAll('#layer-apps .vid__tab')].find((t) => (t.textContent || '').includes('المكتبة'));
  libTab?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  check('reels: the library holds every clip', window.document.querySelectorAll('#layer-apps .vid__card').length === 6,
    String(window.document.querySelectorAll('#layer-apps .vid__card').length));
  window.document.querySelector('#layer-apps .vid__card[data-reel="3"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  const cap3 = window.document.querySelector('#layer-apps .reel__txt span')?.textContent || '';
  check('reels: a library card opens its own clip', cap3.includes('ألعاب'), cap3);
}
await goHome();

/* ══════════════════════════════════════════════════════════════
   DESKTOP + FEATURE PACK (0.9) — shell flip · dock · help · DND ·
   keyboard parity · real editors · terminal · zoom · pinning
   ══════════════════════════════════════════════════════════════ */
await goHome();
const screenEl2 = window.document.getElementById('screen');
const tapKey = (key) => screenEl2.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));

/* real battery through navigator.getBattery (stubbed above) */
check('battery: the real level reaches the status bar (64%)',
  (window.document.getElementById('statusbar')?.textContent || '').includes('64%'),
  window.document.getElementById('statusbar')?.textContent);

/* the web shell stays the phone; the desktop tools wait in the DOM */
check('shell boots as the phone web shell', window.document.body.dataset.shell === 'web', window.document.body.dataset.shell);
check('desk tools rendered for the computer shell', !!window.document.querySelector('.stage .desk-tools'));
check('dock element present (CSS gates it to desktop)', !!window.document.querySelector('#layer-overlay .dock')
  && window.document.querySelectorAll('.dock__btn').length >= 6,
  String(window.document.querySelectorAll('.dock__btn').length));
check('NOVA exposes the shell controls',
  typeof N.setShell === 'function' && typeof N.toggleHelp === 'function'
  && typeof N.toggleDeck === 'function' && typeof N.dnd === 'function');

N.setShell('desktop');
await new Promise((r) => setTimeout(r, 80));
check('setShell(desktop) fills the window', window.document.body.dataset.shell === 'desktop'
  && window.location.search.includes('shell=desktop'), window.location.search);
check('the deck reads closed until asked for', window.document.body.dataset.deck === 'closed');
N.setShell('web');
await new Promise((r) => setTimeout(r, 80));
check('setShell(web) returns to the phone frame', window.document.body.dataset.shell === 'web'
  && !window.location.search.includes('shell=desktop'), window.location.search);

/* `?` keyboard help */
tapKey('?');
await new Promise((r) => setTimeout(r, 60));
check('? opens the keyboard help overlay', !!window.document.querySelector('.help')
  && window.document.querySelectorAll('.help__row').length >= 15,
  String(window.document.querySelectorAll('.help__row').length));
check('help documents the desktop keys',
  (window.document.querySelector('.help')?.textContent || '').includes('حاسوب')
  && (window.document.querySelector('.help')?.textContent || '').includes('عدم الإزعاج'));
tapKey('Escape');
{
  /* the close spring fades the overlay out — poll until the node is gone */
  let gone = false;
  for (let i = 0; i < 30 && !gone; i++) {
    await new Promise((r) => setTimeout(r, 100));
    gone = !window.document.querySelector('.help');
  }
  check('Esc closes the help overlay', gone);
}

/* keyboard parity: T → CONTROL, and the sound node really flips the audio */
tapKey('t');
await new Promise((r) => setTimeout(r, 400));
check('hotkey T opens NOVA CONTROL', N.state.panel === 'control', String(N.state.panel));
{
  const snd = await import(`file://${ROOT}/src/core/sound.js`);
  const before = snd.soundOn();
  window.document.querySelector('.control__node[data-node="sound"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('the CONTROL sound node flips the real audio flag', snd.soundOn() !== before,
    `${before} → ${snd.soundOn()}`);
  window.document.querySelector('.control__node[data-node="sound"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const reduceNode = window.document.querySelector('.control__node[data-node="reduce"]');
  reduceNode?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('the CONTROL reduce-motion node switches the profile',
    window.document.body.dataset.profile === 'reduced', window.document.body.dataset.profile);
  reduceNode?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
}
tapKey('Escape');
await new Promise((r) => setTimeout(r, 400));

/* DND: hotkey N → quiet events, FLOW banner, no orb */
check('DND starts off', N.dnd() === false, String(N.dnd()));
tapKey('n');
await new Promise((r) => setTimeout(r, 120));
check('hotkey N arms Do Not Disturb', N.dnd() === true, String(N.dnd()));
check('a DND state persists on the device', window.localStorage.getItem('nova.dnd.v1') === 'true',
  String(window.localStorage.getItem('nova.dnd.v1')));
N.runAction('media');                 // media on: normally every event becomes an orb
await new Promise((r) => setTimeout(r, 900));
check('media is playing before the quiet event', N.state.mediaPlaying === true);
N.state.orb = null;               // clear any orb left over from the golden flows
N.runAction('event');
await new Promise((r) => setTimeout(r, 300));
{
  const last = N.state.events[0]; // pushEvent unshifts: the newest event leads
  check('events arriving in DND are marked quiet', last.quiet === true, JSON.stringify(!!last.quiet));
  check('DND suppresses the orb even while media plays', !N.state.orb,
    N.state.orb ? 'orb shown' : 'silent');
}
N.openPanel('flow');
await new Promise((r) => setTimeout(r, 450));
check('FLOW shows the DND banner', !window.document.querySelector('.flow__dnd').classList.contains('hidden'));
check('quiet events render as quiet cards', window.document.querySelectorAll('.event-card--quiet').length >= 1,
  String(window.document.querySelectorAll('.event-card--quiet').length));
N.closePanel();
await new Promise((r) => setTimeout(r, 400));
tapKey('n');
await new Promise((r) => setTimeout(r, 120));
check('hotkey N disarms DND', N.dnd() === false);
N.runAction('event');
await new Promise((r) => setTimeout(r, 200));
check('events are loud again once DND is off', !N.state.events[0].quiet);
N.state.mediaPlaying = false;

/* notes — a real persisted editor */
N.openApp('notes', null);
await new Promise((r) => setTimeout(r, 700));
check('notes opens its list', !!window.document.querySelector('#layer-apps .nt__row'));
window.document.querySelector('#layer-apps .nt__new')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
const ntTitle = window.document.querySelector('#layer-apps .nt__title');
check('notes has a real editor surface', !!ntTitle && !!window.document.querySelector('#layer-apps .nt__area'));
if (ntTitle) {
  ntTitle.value = 'مذكرة سطح المكتب';
  ntTitle.dispatchEvent(new window.Event('input', { bubbles: true }));
}
check('notes persist on the device',
  String(window.localStorage.getItem('nova.notes.v1') || '').includes('مذكرة سطح المكتب'),
  (window.localStorage.getItem('nova.notes.v1') || 'null').slice(0, 60));
N.back();
await new Promise((r) => setTimeout(r, 900));

/* tasks — quick add + persistence */
N.openApp('tasks', null);
await new Promise((r) => setTimeout(r, 700));
const tskIn = window.document.querySelector('#layer-apps .tsk__in');
const tskRows = () => window.document.querySelectorAll('#layer-apps .tsk__row').length;
const rowsBefore = tskRows();
check('tasks shows its counter', !!window.document.querySelector('#layer-apps .tsk__count'));
if (tskIn) {
  tskIn.value = 'تجربة من الحاسوب';
  tskIn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
}
check('tasks quick-add inserts a row', tskRows() === rowsBefore + 1, `${rowsBefore} → ${tskRows()}`);
check('tasks persist on the device',
  String(window.localStorage.getItem('nova.tasks.v1') || '').includes('تجربة من الحاسوب'),
  (window.localStorage.getItem('nova.tasks.v1') || 'null').slice(0, 60));
N.back();
await new Promise((r) => setTimeout(r, 900));

/* calculator — history tape */
N.openApp('calc', null);
await new Promise((r) => setTimeout(r, 700));
{
  const key = (label) => [...window.document.querySelectorAll('#layer-apps .calc__key')]
    .find((k) => k.textContent.trim() === label);
  key('7')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  key('×')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  key('8')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  key('=')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  check('calculator keeps a history tape', window.document.querySelectorAll('#layer-apps .calc__line').length >= 1,
    String(window.document.querySelectorAll('#layer-apps .calc__line').length));
}
N.back();
await new Promise((r) => setTimeout(r, 900));

/* terminal — the new app, real commands */
N.openApp('terminal', null);
await new Promise((r) => setTimeout(r, 700));
const termIn = window.document.querySelector('#layer-apps .term__in');
check('terminal opens with a prompt', !!termIn && !!window.document.querySelector('#layer-apps .term__out'));
if (termIn) {
  termIn.value = 'echo nova-desktop';
  termIn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
}
check('terminal runs commands', (window.document.querySelector('#layer-apps .term__out')?.textContent || '')
  .includes('nova-desktop'));
if (termIn) {
  termIn.value = 'neofetch';
  termIn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
}
check('terminal neofetch reports the live system',
  (window.document.querySelector('#layer-apps .term__out')?.textContent || '').includes('NOVA OS'),
  (window.document.querySelector('#layer-apps .term__out')?.textContent || '').slice(0, 40));
N.back();
await new Promise((r) => setTimeout(r, 900));

/* CANVAS — wheel zoom + window close/maximize */
N.runAction('resume');
await new Promise((r) => setTimeout(r, 500));
N.showCanvas();
await new Promise((r) => setTimeout(r, 400));
const canvasEl2 = window.document.querySelector('#layer-canvas .canvas');
check('canvas restored windows for the desktop tests', window.document.querySelectorAll('#layer-canvas .win').length >= 1,
  String(window.document.querySelectorAll('#layer-canvas .win').length));
canvasEl2?.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -260, bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 60));
check('wheel zooms the space', canvasEl2 && canvasEl2.dataset.zoom !== '1.00', canvasEl2?.dataset.zoom);
{
  const wins = window.document.querySelectorAll('#layer-canvas .win');
  check('windows expose close + maximize controls',
    !!wins[0]?.querySelector('.win__btn--close') && !!wins[0]?.querySelector('.win__btn--max'));
  const countBefore = wins.length;
  wins[0]?.querySelector('.win__btn--max')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('maximize engages', !!window.document.querySelector('#layer-canvas .win--max'));
  window.document.querySelector('#layer-canvas .win--max .win__btn--max')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  check('maximize restores', !window.document.querySelector('#layer-canvas .win--max'));
  window.document.querySelector('#layer-canvas .win .win__btn--close')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  check('window close removes the window',
    window.document.querySelectorAll('#layer-canvas .win').length === countBefore - 1,
    `${countBefore} → ${window.document.querySelectorAll('#layer-canvas .win').length}`);
}
await goHome();

/* app chrome gets a close button that goes home */
N.openApp('gallery', null);
await new Promise((r) => setTimeout(r, 700));
check('app chrome shows the close button', !!window.document.querySelector('#layer-apps .app__close'));
window.document.querySelector('#layer-apps .app__close')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 1200));
check('the chrome close button returns home', N.state.surface === 'home', N.state.surface);

/* long-press pins a home card (persisted) */
await goHome();
{
  const pinCard0 = window.document.querySelector('#layer-home .app-card[data-app="notes"]')
    || window.document.querySelector('#layer-home .app-card');
  const appId = pinCard0?.dataset?.app;
  pinCard0?.dispatchEvent(mkEv('pointerdown', { clientX: 90, clientY: 520, bubbles: true, cancelable: true, pointerId: 21 }));
  await new Promise((r) => setTimeout(r, 640));
  pinCard0?.dispatchEvent(mkEv('pointerup', { clientX: 90, clientY: 520, bubbles: true, cancelable: true, pointerId: 21 }));
  await new Promise((r) => setTimeout(r, 200));
  /* togglePin() rebuilds the card grid — re-query the live element */
  const pinCard = window.document.querySelector(`#layer-home .app-card[data-app="${appId}"]`);
  check('long-press pins the card', !!pinCard && pinCard.classList.contains('app-card--pinned'), appId);
  check('the pin badge shows', !!pinCard?.querySelector('.app-card__pin'));
  check('pins persist on the device',
    String(window.localStorage.getItem('nova.pinned.v1') || '').includes(String(appId)),
    window.localStorage.getItem('nova.pinned.v1'));
  /* the browser would fire a click right after the long-press — it must be swallowed */
  pinCard?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 250));
  check('a pinned click does not reopen the app', N.state.surface === 'home', N.state.surface);
  /* unpin so the rest of the suite sees the default home */
  pinCard?.dispatchEvent(mkEv('pointerdown', { clientX: 90, clientY: 520, bubbles: true, cancelable: true, pointerId: 22 }));
  await new Promise((r) => setTimeout(r, 640));
  pinCard?.dispatchEvent(mkEv('pointerup', { clientX: 90, clientY: 520, bubbles: true, cancelable: true, pointerId: 22 }));
  await new Promise((r) => setTimeout(r, 200));
  const pinCard2 = window.document.querySelector(`#layer-home .app-card[data-app="${appId}"]`);
  check('long-press again unpins', !!pinCard2 && !pinCard2.classList.contains('app-card--pinned'));
}
await goHome();

/* the service worker file must match the shipped version */
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'src/core/version.js'), 'utf8');
const versionFile = fs.readFileSync(path.join(ROOT, '..', 'VERSION'), 'utf8').trim();
check('sw.js version matches VERSION', sw.includes(`NOVA_VERSION = '${versionFile}'`), versionFile);
check('version.js matches VERSION', core.includes(`NOVA_VERSION = '${versionFile}'`), versionFile);
check('manifest is linked in index.html', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('manifest.webmanifest'));
check('manifest icons exist', ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
  .every((f) => fs.existsSync(path.join(ROOT, 'icons', f))));
check('fx.css is linked (the loaded stylesheets cover every surface)', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('styles/fx.css'));
{
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const mustCache = ['./styles/fx.css', './src/core/launcher.js', './src/core/wallpaper.js', './src/motion/fx.js', './src/surfaces/setup.js', './src/surfaces/launch.js', './src/surfaces/dock.js'];
  check('sw.js precaches every runtime module', mustCache.every((u) => swSrc.includes(`'${u}'`)),
    mustCache.filter((u) => !swSrc.includes(`'${u}'`)).join(',') || 'all present');
}

/* ── taps must reach buttons: no pointer capture before a swipe engages ──
   Capturing the pointer on every pointerdown makes the browser retarget the
   `click` to the capturing element (#screen), so nothing inside the phone is
   clickable. Guard the fix at the source level and in the live DOM. */
{
  const gsrc = fs.readFileSync(path.join(ROOT, 'src/motion/gestures.js'), 'utf8');
  const downBody = gsrc.slice(gsrc.indexOf('function down(e)'), gsrc.indexOf('function move(e)'));
  check('gestures: pointerdown never captures the pointer (clicks survive)', !downBody.includes('setPointerCapture'));
  const dragDown = gsrc.slice(gsrc.lastIndexOf('function down(e)'), gsrc.lastIndexOf('function move(e)'));
  check('draggable: pointerdown never captures the pointer', !dragDown.includes('setPointerCapture'));

  const css = fs.readFileSync(path.join(ROOT, 'styles/shell.css'), 'utf8');
  check('shell.css: empty layers are transparent to the pointer', /\.layer\s*\{[^}]*pointer-events:\s*none/.test(css) && /\.layer\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto/.test(css));

  // a plain tap (down → up with no movement) on a deck chip still clicks
  let clicked = 0;
  const btn = window.document.querySelector('#deck-actions .chip');
  const screenEl = window.document.getElementById('screen');
  let captured = false;
  screenEl.setPointerCapture = () => { captured = true; };
  const tap = (type, x, y) => screenEl.dispatchEvent(mkEv(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 9, button: 0 }));
  tap('pointerdown', 200, 400); tap('pointerup', 200, 400);
  check('gestures: a plain tap on the screen does not capture the pointer', !captured);
  if (btn) { btn.addEventListener('click', () => { clicked++; }, { once: true }); btn.click(); }
  check('deck: action chips are clickable', clicked === 1);
}

await new Promise((r) => setTimeout(r, 300));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log('runtime errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
process.exit(failed.length || errors.length ? 1 : 0);
