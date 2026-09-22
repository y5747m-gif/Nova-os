/* ══════════════════════════════════════════════════════════════
   NOVA state — one store, unidirectional flow (docs/03 §5)
   The demo catalogue is a FULL phone: every app a real device
   carries. Inside the APK the launcher adapter swaps in the real
   installed packages; in a browser this is the universe.
   ══════════════════════════════════════════════════════════════ */

import { icon } from './icons.js';

/* ── app catalogue — كل التطبيقات ───────────────────────────────── */
export const APPS = {
  whatsapp:  { id: 'whatsapp',  name: 'الرسائل',        kind: 'chat',     icon: 'chat',     color: '#34d399', sub: 'محمد · عايز يكلمك',        title: 'محمد',           titleSub: 'متصل الآن' },
  phone:     { id: 'phone',     name: 'الهاتف',         kind: 'phone',    icon: 'phone',    color: '#34d399', sub: '3 مكالمات فائتة',           title: 'الهاتف',         titleSub: 'لوحة الاتصال' },
  contacts:  { id: 'contacts',  name: 'جهات الاتصال',   kind: 'contacts', icon: 'people',   color: '#7dd3fc', sub: '128 جهة · محدَّث',          title: 'جهات الاتصال',   titleSub: 'الكل' },
  camera:    { id: 'camera',    name: 'الكاميرا',       kind: 'camera',   icon: 'camera',   color: '#ff6b9a', sub: 'جاهزة للتصوير',            title: 'الكاميرا',       titleSub: 'الوضع التلقائي' },
  gallery:   { id: 'gallery',   name: 'الصور',          kind: 'gallery',  icon: 'gallery',  color: '#ff6b9a', sub: '128 عنصر · آخر تحديث اليوم', title: 'الصور',        titleSub: 'آخر 12 صورة' },
  music:     { id: 'music',     name: 'الموسيقى',       kind: 'music',    icon: 'music',    color: '#6c5ce7', sub: 'يشغل الآن · Aurora Drift',  title: 'Aurora Drift',   titleSub: 'NOVA Sessions' },
  video:     { id: 'video',     name: 'الفيديو',        kind: 'video',    icon: 'play',     color: '#f5a524', sub: 'بكرات يومية · مكتبتك',     title: 'الفيديو',       titleSub: 'البكرات' },
  podcasts:  { id: 'podcasts',  name: 'البودكاست',      kind: 'podcast',  icon: 'mic',      color: '#a78bfa', sub: 'حلقة جديدة · 38 دقيقة',     title: 'البودكاست',      titleSub: 'استمر من 12:04' },
  books:     { id: 'books',     name: 'الكتب',          kind: 'books',    icon: 'book',     color: '#f5a524', sub: 'تقرأ الآن · 64%',           title: 'الكتب',          titleSub: 'مكتبتك' },
  notes:     { id: 'notes',     name: 'الملاحظات',      kind: 'notes',    icon: 'notes',    color: '#f5a524', sub: 'آخر ملاحظة: خطة الأسبوع',   title: 'خطة الأسبوع',    titleSub: 'آخر تعديل اليوم' },
  tasks:     { id: 'tasks',     name: 'المهام',         kind: 'tasks',    icon: 'check',    color: '#34d399', sub: '5 مهام · 2 منجزة',          title: 'المهام',         titleSub: 'اليوم' },
  mail:      { id: 'mail',      name: 'البريد',         kind: 'mail',     icon: 'mail',     color: '#7dd3fc', sub: '4 رسائل جديدة',             title: 'البريد',         titleSub: 'الوارد' },
  calendar:  { id: 'calendar',  name: 'التقويم',        kind: 'calendar', icon: 'calendar', color: '#ff6b9a', sub: 'اجتماع الفريق · 2:30',      title: 'التقويم',        titleSub: 'هذا الأسبوع' },
  browser:   { id: 'browser',   name: 'المتصفح',        kind: 'browser',  icon: 'browser',  color: '#7dd3fc', sub: '3 تبويبات مفتوحة',          title: 'الويب',          titleSub: '3 تبويبات' },
  maps:      { id: 'maps',      name: 'الخرائط',        kind: 'maps',     icon: 'maps',     color: '#22d3ee', sub: 'الطريق للبيت · 24 دقيقة',   title: 'الطريق للبيت',   titleSub: '24 دقيقة · 18 كم' },
  files:     { id: 'files',     name: 'الملفات',        kind: 'files',    icon: 'files',    color: '#f5a524', sub: '12.4 جيجا مستخدمة',          title: 'الملفات',        titleSub: 'الجهاز' },
  weather:   { id: 'weather',   name: 'الطقس',          kind: 'weather',  icon: 'weather',  color: '#22d3ee', sub: '24° · صحو جزئيًا',          title: 'القاهرة',        titleSub: '24° · صحو' },
  news:      { id: 'news',      name: 'الأخبار',        kind: 'news',     icon: 'news',     color: '#ff6b9a', sub: 'آخر الأخبار الآن',          title: 'الأخبار',        titleSub: 'موجز اليوم' },
  store:     { id: 'store',     name: 'المتجر',         kind: 'store',    icon: 'store',    color: '#4ade80', sub: '12 تحديثًا بانتظارك',       title: 'المتجر',         titleSub: 'محدَّث حديثًا' },
  wallet:    { id: 'wallet',    name: 'المحفظة',        kind: 'wallet',   icon: 'wallet',   color: '#34d399', sub: 'بطاقة NOVA · 2,480 ج.م',    title: 'المحفظة',        titleSub: 'الرصيد' },
  health:    { id: 'health',    name: 'الصحة',          kind: 'health',   icon: 'heart',    color: '#ff5c5c', sub: '7,200 خطوة اليوم',          title: 'الصحة',          titleSub: 'اليوم' },
  fitness:   { id: 'fitness',   name: 'اللياقة',        kind: 'fitness',  icon: 'bolt',     color: '#4ade80', sub: 'تمرين اليوم · 32 دقيقة',    title: 'اللياقة',        titleSub: 'البرنامج' },
  games:     { id: 'games',     name: 'الألعاب',        kind: 'games',    icon: 'game',     color: '#6c5ce7', sub: '3 ألعاب مثبّتة',            title: 'الألعاب',        titleSub: 'المثبّتة' },
  social:    { id: 'social',    name: 'التواصل',        kind: 'social',   icon: 'globe',    color: '#22d3ee', sub: '18 إشعارًا جديدًا',         title: 'التواصل',        titleSub: 'آخر الأخبار' },
  meetings:  { id: 'meetings',  name: 'الاجتماعات',     kind: 'meetings', icon: 'video',    color: '#6c5ce7', sub: 'اجتماع بعد 25 دقيقة',       title: 'الاجتماعات',     titleSub: 'اليوم' },
  translate: { id: 'translate', name: 'الترجمة',        kind: 'translate', icon: 'translate', color: '#7dd3fc', sub: 'عربي ⇄ English',           title: 'الترجمة',        titleSub: 'فوري' },
  recorder:  { id: 'recorder',  name: 'المسجّل',        kind: 'recorder', icon: 'mic',      color: '#f5a524', sub: '3 تسجيلات',                 title: 'المسجّل',        titleSub: 'التسجيلات' },
  calc:      { id: 'calc',      name: 'الحاسبة',        kind: 'calc',     icon: 'calc',     color: '#a78bfa', sub: 'علمي وبسيط',                title: 'الحاسبة',        titleSub: 'الوضع البسيط' },
  clock:     { id: 'clock',     name: 'الساعة',         kind: 'clock',    icon: 'clock',    color: '#22d3ee', sub: 'منبّهان مفعّلان',           title: 'الساعة',         titleSub: 'توقيت القاهرة' },
  passwords: { id: 'passwords', name: 'كلمات المرور',   kind: 'passwords', icon: 'shield',  color: '#a78bfa', sub: '42 مدخلًا محفوظًا',          title: 'كلمات المرور',   titleSub: 'مشفّرة على جهازك' },
  cloud:     { id: 'cloud',     name: 'السحابة',        kind: 'cloud',    icon: 'cloud',    color: '#7dd3fc', sub: '8.2 جيجا من 15',            title: 'السحابة',        titleSub: 'مزامنة تلقائية' },
  smart:     { id: 'smart',     name: 'المنزل الذكي',   kind: 'iot',      icon: 'bulb',     color: '#f5a524', sub: '4 أجهزة متصلة',             title: 'المنزل الذكي',   titleSub: 'غرفة المعيشة' },
  wear:      { id: 'wear',      name: 'الأجهزة',        kind: 'wear',     icon: 'bluetooth', color: '#6c5ce7', sub: 'ساعة NOVA · 86%',           title: 'الأجهزة',        titleSub: 'متصلة' },
  privacy:   { id: 'privacy',   name: 'مركز الخصوصية',  kind: 'privacy',  icon: 'shield',   color: '#7dd3fc', sub: 'استخدام الحساسات',          title: 'مركز الخصوصية',  titleSub: 'آخر 24 ساعة' },
  settings:  { id: 'settings',  name: 'الإعدادات',      kind: 'settings', icon: 'settings', color: '#6c5ce7', sub: 'الخلفية · المظهر · الحركة', title: 'الإعدادات',      titleSub: 'خصّص NOVA' },
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

/** Every demo app id, alphabetical by Arabic name — the drawer order. */
export function allAppIds() {
  return Object.values(APPS)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    .map((a) => a.id);
}

/* Small helper surfaces use to render an app icon chip. */
export function appIconHTML(appId, cls = 'ico') {
  return icon(appMeta(appId).icon, cls);
}
