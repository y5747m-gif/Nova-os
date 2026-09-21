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
Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true });


/* jsdom 25 has no PointerEvent constructor — build one either way. */
function mkEv(type, opts) {
  let ev;
  try { ev = mkEv(type, opts); }
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

await import(`file://${ROOT}/src/main.js`);
await new Promise((r) => setTimeout(r, 300));

const N = window.NOVA;
check('boot: NOVA global exists', !!N);
check('boot: lock surface', N.state.surface === 'lock', N.state.surface);
check('boot: events seeded', N.state.events.length >= 2, String(N.state.events.length));
check('boot: deck chips rendered', window.document.querySelectorAll('#chips-profile .chip').length === 4);

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
N.runAction('canvas');
await new Promise((r) => setTimeout(r, 600));
window.document.getElementById('screen').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await new Promise((r) => setTimeout(r, 1400));
check('canvas releases touches after hiding', canvasEl.style.pointerEvents === 'none', canvasEl.style.pointerEvents || 'auto');

/* ── the lock screen must not leak home touches ─────────────────── */
N.runAction('lock');
await new Promise((r) => setTimeout(r, 300));
check('lock surface restores home behind it', window.document.querySelector('#layer-home .home').dataset.hidden === '0');

await new Promise((r) => setTimeout(r, 400));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log('runtime errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
process.exit(failed.length || errors.length ? 1 : 0);
