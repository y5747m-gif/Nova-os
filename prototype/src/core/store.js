/* ══════════════════════════════════════════════════════════════
   NOVA state — one store, unidirectional flow (docs/03 §5)
   ══════════════════════════════════════════════════════════════ */

import { icon } from './icons.js';

/* ── app catalogue ─────────────────────────────────────────────── */
export const APPS = {
  whatsapp: { id: 'whatsapp', name: 'الرسائل', kind: 'chat', icon: 'chat', color: '#34d399', sub: 'محمد · عايز يكلمك', title: 'محمد', titleSub: 'متصل الآن' },
  gallery:  { id: 'gallery',  name: 'الصور',  kind: 'gallery', icon: 'gallery', color: '#ff6b9a', sub: '128 عنصر · آخر تحديث اليوم', title: 'الصور', titleSub: 'آخر 12 صورة' },
  music:    { id: 'music',    name: 'الموسيقى', kind: 'music', icon: 'music', color: '#6c5ce7', sub: 'يشغل الآن · Aurora Drift', title: 'Aurora Drift', titleSub: 'NOVA Sessions' },
  notes:    { id: 'notes',    name: 'الملاحظات', kind: 'notes', icon: 'notes', color: '#f5a524', sub: 'آخر ملاحظة: خطة الأسبوع', title: 'خطة الأسبوع', titleSub: 'آخر تعديل اليوم' },
  browser:  { id: 'browser',  name: 'المتصفح', kind: 'browser', icon: 'browser', color: '#7dd3fc', sub: '3 تبويبات مفتوحة', title: 'الويب', titleSub: '3 تبويبات' },
  maps:     { id: 'maps',     name: 'الخرائط', kind: 'maps', icon: 'maps', color: '#22d3ee', sub: 'الطريق للبيت · 24 دقيقة', title: 'الطريق للبيت', titleSub: '24 دقيقة · 18 كم' },
  privacy:  { id: 'privacy',  name: 'مركز الخصوصية', kind: 'privacy', icon: 'shield', color: '#7dd3fc', sub: 'استخدام الحساسات', title: 'مركز الخصوصية', titleSub: 'آخر 24 ساعة' },
};

export const CONTACTS = [
  { id: 'mohamed', name: 'محمد', initials: 'م', kind: 'person' },
  { id: 'sara',    name: 'سارة', initials: 'س', kind: 'person' },
  { id: 'dad',     name: 'بابا', initials: 'ب', kind: 'person' },
  { id: 'folder',  name: 'رحلة الغردقة', initials: '✈', kind: 'folder', icon: 'files' },
  { id: 'nearby',  name: 'تابلت NOVA', initials: '⌁', kind: 'device', icon: 'bluetooth' },
];

/* ── state ─────────────────────────────────────────────────────── */
export const state = {
  surface: 'lock',            // lock | home | app | canvas | split
  panel: null,                // null | core | flow | control
  focusedApp: null,           // appId opened as a full surface
  split: null,                // { host, guest, ratio }
  windows: [                  // NOVA CANVAS — spatial memory
    { appId: 'browser', x: 22,  y: 150 },
    { appId: 'notes',   x: 116, y: 382 },
    { appId: 'gallery', x: 30,  y: 556 },
  ],
  events: [],                 // NOVA FLOW
  orb: null,                  // { event } | 'card'
  mediaPlaying: false,
  staged: null,               // { kind:'photo', index } staged content for drag & drop
  lastWorkspace: ['whatsapp', 'browser', 'notes'],
  seenLock: false,
};

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function notify(what = '*') { for (const fn of subs) fn(state, what); }

/* ── event factory (NOVA FLOW / orb) ───────────────────────────── */
let eventSeq = 0;
export function makeEvent(preset = {}) {
  const presets = [
    { who: 'محمد', icon: 'chat', color: '#34d399', body: 'عايز يكلمك', actions: ['رد', 'اتصال'] },
    { who: 'التقويم', icon: 'actions', color: '#f5a524', body: 'اجتماع الفريق بعد 25 دقيقة', actions: ['تأجيل', 'افتح'] },
    { who: 'الصور', icon: 'gallery', color: '#ff6b9a', body: 'تم تجهيز 4 صور للمشاركة', actions: ['إرسال', 'لاحقًا'] },
    { who: 'سارة', icon: 'chat', color: '#7dd3fc', body: 'أرسلت لك ملف رحلة الغردقة', actions: ['افتح', 'رد'] },
  ];
  const p = { ...presets[eventSeq % presets.length], ...preset };
  eventSeq++;
  return { id: `ev${eventSeq}`, t: Date.now(), deferred: false, ...p };
}

export function pushEvent(evt) {
  state.events.unshift(evt);
  // If media is playing the event must NOT interrupt — it becomes an orb (docs/01 §7)
  if (state.mediaPlaying && state.surface !== 'lock') state.orb = { event: evt };
  notify('events');
  return evt;
}

export function deferEvent(id) {
  const e = state.events.find((x) => x.id === id);
  if (e) e.deferred = true;
  notify('events');
}

/* ── workspace helpers ─────────────────────────────────────────── */
export function windowFor(appId) { return state.windows.find((w) => w.appId === appId); }

export function rememberWindow(appId, x, y) {
  const w = windowFor(appId);
  if (w) { w.x = x; w.y = y; }
  else state.windows.push({ appId, x, y });
  notify('windows');
}

export function forgetWindow(appId) {
  state.windows = state.windows.filter((w) => w.appId !== appId);
  notify('windows');
}

export function appMeta(appId) { return APPS[appId] || { id: appId, name: appId, icon: 'apps', color: '#6c5ce7', sub: '' }; }

/* Small helper surfaces use to render an app icon chip. */
export function appIconHTML(appId, cls = 'ico') {
  return icon(appMeta(appId).icon, cls);
}
