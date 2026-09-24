/* ══════════════════════════════════════════════════════════════
   App surfaces — one instance, four shapes (docs/01 §4)
   The same content renderer is used by the full surface, the
   split panes and the NOVA CANVAS window previews.
   Every app in the catalogue has a real face; «الإعدادات» is the
   control room: wallpaper, appearance, motion, sound — everything.
   ══════════════════════════════════════════════════════════════ */

import { h, gradient } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  appMeta, APPS, CONTACTS, state, setDnd, loadJSON, saveJSON, PERSIST, allAppIds,
} from '../core/store.js';
import { draggable } from '../motion/gestures.js';
import {
  isNativeLauncher, dialNumber, pickWallpaper, launcherState, requestDefaultLauncher, openHomeSettings,
} from '../core/launcher.js';
import {
  WALLPAPERS, wallpaperId, setWallpaper, onWallpaperChange,
  openImagePicker, customImage, clearCustomImage,
} from '../core/wallpaper.js';
import {
  nova, PROFILES, THEMES, ACCENTS, setProfile, setTheme, setMode, setAccent,
} from '../motion/config.js';
import { soundOn, setSoundOn } from '../core/sound.js';
import { NOVA_VERSION } from '../core/version.js';

/* ── content renderers ─────────────────────────────────────────── */
const THREAD = [
  { side: 'in',  text: 'صباح الخير 👋' },
  { side: 'out', text: 'صباح النور، كنت هبعتلك الصور دلوقتي' },
  { side: 'in',  text: 'عايز يكلمك لو ينفع' },
];

export function contentFor(appId, ctx = {}) {
  const meta = appMeta(appId);
  switch (meta.kind) {
    case 'chat': return chatContent(ctx, meta);
    case 'gallery': return galleryContent(ctx);
    case 'music': return musicContent(ctx, meta);
    case 'notes': return notesContent(ctx);
    case 'browser': return browserContent();
    case 'maps': return mapsContent();
    case 'privacy': return privacyContent(ctx);
    case 'settings': return settingsContent(ctx);
    case 'phone': return phoneContent(ctx);
    case 'contacts': return contactsContent(ctx);
    case 'camera': return cameraContent(ctx);
    case 'video': return videoContent(ctx);
    case 'mail': return mailContent();
    case 'calendar': return calendarContent();
    case 'clock': return clockContent();
    case 'calc': return calcContent(ctx);
    case 'weather': return weatherContent();
    case 'news': return newsContent();
    case 'podcast': return podcastContent(ctx);
    case 'books': return booksContent();
    case 'tasks': return tasksContent(ctx);
    case 'store': return storeContent(ctx);
    case 'wallet': return walletContent();
    case 'health': return healthContent();
    case 'fitness': return fitnessContent(ctx);
    case 'games': return gamesContent();
    case 'social': return socialContent(ctx);
    case 'meetings': return meetingsContent(ctx);
    case 'translate': return translateContent(ctx);
    case 'recorder': return recorderContent(ctx);
    case 'passwords': return passwordsContent(ctx);
    case 'cloud': return cloudContent();
    case 'iot': return iotContent(ctx);
    case 'wear': return wearContent();
    case 'files': return filesContent();
    case 'terminal': return terminalContent(ctx);
    case 'find': return findContent(ctx);
    case 'spaces': return spacesContent(ctx);
    case 'security': return securityContent(ctx);
    case 'ai': return aiContent(ctx);
    case 'control': return controlContent(ctx);
    case 'canvas': return canvasContent(ctx);
    case 'flow': return flowContent(ctx);
    default: return genericContent(meta, ctx);
  }
}

function chatContent(ctx, meta) {
  const thread = h('div', { class: 'wa__thread' });
  const staged = h('div', { class: 'wa__staged hidden' });
  const composer = h('button', {
    class: 'wa__composer',
    onclick: () => {
      thread.append(h('div', { class: 'msg msg--out' }, 'تم ✅'));
      ctx.toast?.('أُرسلت الرسالة');
      ctx.emit?.('success');
    },
  }, h('span', { html: icon('pluss', 'ico ico--sm') }), h('span', {}, 'اكتب رسالة…'), h('span', { style: { marginInlineStart: 'auto' }, html: icon('mic', 'ico ico--sm') }));

  function paintThread() {
    thread.replaceChildren();
    for (const m of THREAD) thread.append(h('div', { class: `msg msg--${m.side}` }, m.text));
    if (ctx.staged) {
      staged.classList.remove('hidden');
      staged.replaceChildren(
        h('div', { class: 'thumb', style: { background: gradient(ctx.staged.index ?? 3) } }),
        h('div', {}, h('b', {}, 'الصورة جاهزة للإرسال'), h('div', { style: { color: 'var(--nv-text-2)', fontSize: '11.5px' } }, 'اسحب أو اضغط إرسال')),
        h('button', {
          style: { marginInlineStart: 'auto', padding: '7px 12px', borderRadius: '999px', background: 'color-mix(in srgb, var(--nv-mint) 28%, transparent)', fontSize: '12px' },
          onclick: () => {
            thread.append(h('div', { class: 'msg msg--out', style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('span', { style: { width: '46px', height: '46px', borderRadius: '10px', display: 'block', background: gradient(ctx.staged.index ?? 3) } }),
              h('span', {}, 'الصورة')));
            staged.classList.add('hidden');
            ctx.onStagedSent?.();
            ctx.toast?.('تم إرسال الصورة إلى محمد');
            ctx.emit?.('success');
          },
        }, 'إرسال'),
      );
    } else {
      staged.classList.add('hidden');
    }
  }

  const wrap = h('div', { class: 'wa' },
    h('div', { class: 'wa__tabs' },
      h('button', { 'aria-pressed': 'true' }, 'المحادثة'),
      h('button', {}, 'الملفات'),
      h('button', {}, 'مشترك'),
    ),
    thread,
    staged,
    composer,
  );

  paintThread();
  wrap.__paint = paintThread;
  return wrap;
}

function galleryContent(ctx) {
  const grid = h('div', { class: 'gal__grid' });
  for (let i = 0; i < 12; i++) {
    const ph = h('div', {
      class: 'ph',
      dataset: { photo: String(i), drag: 'photo' },
      style: { background: gradient(i + (ctx.seed || 0)) },
      title: 'اسحب الصورة إلى هدف',
    });
    grid.append(ph);
  }
  return h('div', { class: 'gal' },
    h('div', { class: 'gal__hint' }, h('span', { html: icon('hand', 'ico ico--sm') }), h('span', {}, 'اسحب صورة إلى شخص · تطبيق · مجلد · جهاز قريب')),
    grid,
  );
}

function musicContent(ctx, meta) {
  const playing = { v: true };
  const play = h('button', {
    class: 'play',
    html: icon('pause', 'ico'),
    onclick: () => {
      playing.v = !playing.v;
      play.innerHTML = playing.v ? icon('pause', 'ico') : icon('play', 'ico');
      ctx.onMedia?.(playing.v);
      ctx.emit?.(playing.v ? 'open' : 'close');
    },
  });
  const art = h('div', { class: 'mu__art' }, h('span', {}, '◉'));
  setTimeout(() => ctx.onMedia?.(true), 0);
  return h('div', { class: 'mu' },
    art,
    h('div', { class: 'mu__title' }, h('b', {}, meta.title), h('span', {}, meta.titleSub)),
    h('div', { class: 'mu__bars' }, ...Array.from({ length: 5 }, () => h('i'))),
    h('div', { class: 'mu__ctrl' },
      h('span', {}, '⏮'),
      play,
      h('span', {}, '⏭'),
    ),
  );
}

function notesContent(ctx) {
  /* a REAL notebook: create, edit, persisted on the device */
  const seed = [{
    id: 'n1',
    title: 'خطة الأسبوع',
    body: '• إنهاء بروتوتايب NOVA MOTION\n• مراجعة منحنى الـspring مع الفريق\n• تجربة الإيماءات على جهاز حقيقي',
  }];
  const notes = loadJSON(PERSIST.notes, null) || seed.map((n) => ({ ...n }));
  let sel = null;

  const save = () => saveJSON(PERSIST.notes, notes);
  const root = h('div', { class: 'nt' });

  function renderList() {
    const rows = notes.map((n) => h('button', {
      class: 'nt__row',
      onclick: () => { sel = n.id; render(); },
    },
      h('b', {}, n.title || 'بلا عنوان'),
      h('span', {}, (n.body || 'ملاحظة فارغة').split('\n')[0]),
      h('small', {}, `${(n.body || '').length} حرف`),
    ));
    root.replaceChildren(
      h('div', { class: 'nt__bar' },
        h('span', {}, `${notes.length} ${notes.length === 1 ? 'ملاحظة' : 'ملاحظات'}`),
        h('button', { class: 'nt__new', dataset: { nodrag: '1' }, onclick: () => {
          const n = { id: `n${Date.now()}`, title: 'ملاحظة جديدة', body: '' };
          notes.unshift(n); save(); sel = n.id; render();
          ctx.emit?.('success');
        } }, '＋ جديدة'),
      ),
      h('div', { class: 'nt__list' }, rows.length ? rows : h('p', {}, 'لا توجد ملاحظات — اضغط «＋ جديدة».')),
    );
  }

  function renderEditor() {
    const n = notes.find((x) => x.id === sel);
    if (!n) { sel = null; render(); return; }
    const title = h('input', {
      class: 'nt__title', value: n.title, placeholder: 'العنوان',
      dataset: { nodrag: '1' },
      oninput: (e) => { n.title = e.target.value; save(); },
    });
    const area = h('textarea', {
      class: 'nt__area', placeholder: 'اكتب هنا… يُحفظ تلقائيًا على جهازك',
      dataset: { nodrag: '1' }, text: n.body,
      oninput: (e) => { n.body = e.target.value; save(); },
    });
    root.replaceChildren(
      h('div', { class: 'nt__bar' },
        h('button', { class: 'nt__back', dataset: { nodrag: '1' }, onclick: () => { sel = null; render(); } }, '← القائمة'),
        h('span', {}, 'يُحفظ تلقائيًا'),
        h('button', { class: 'nt__del', dataset: { nodrag: '1' }, onclick: () => {
          const i = notes.findIndex((x) => x.id === n.id);
          if (i >= 0) notes.splice(i, 1);
          save(); sel = null; render(); ctx.emit?.('close');
        } }, 'حذف'),
      ),
      title, area,
    );
    try { area.focus(); } catch { /* ignore */ }
  }

  function render() { sel ? renderEditor() : renderList(); }
  render();
  return root;
}

function browserContent() {
  return h('div', { class: 'simple' },
    h('div', { style: { display: 'flex', gap: '9px', alignItems: 'center', padding: '9px 12px', borderRadius: '14px', background: 'color-mix(in srgb, var(--nv-text) 6%, transparent)', fontSize: '12.5px', color: 'var(--nv-text-2)' } },
      h('span', { html: icon('search', 'ico ico--sm') }), 'nova.os/docs/motion'),
    h('h3', {}, 'NOVA MOTION'),
    h('p', {}, 'الحركة مش تأثير، الحركة هي العلاقة المكانية بين اللي لمسته واللي ظهر.'),
    h('div', { class: 'line', style: { width: '88%' } }),
    h('div', { class: 'line', style: { width: '70%' } }),
    h('div', { class: 'line', style: { width: '78%' } }),
  );
}

function mapsContent() {
  return h('div', { class: 'simple' },
    h('div', { class: 'map' }, h('div', { class: 'route' }), h('div', { class: 'pin' })),
    h('p', {}, 'الطريق للبيت · 24 دقيقة · 18 كم'),
  );
}

function privacyContent(ctx) {
  const rows = [
    ['camera', 'الكاميرا', '4 مرات', '#ff6b9a'],
    ['maps', 'الموقع', '2 مرات', '#22d3ee'],
    ['mic', 'الميكروفون', 'مرة واحدة', '#f5a524'],
  ];
  return h('div', { class: 'privacy' },
    h('p', { style: { margin: 0, fontSize: '12.5px', color: 'var(--nv-text-2)', lineHeight: '1.9' } },
      'NOVA تعرض لك مين استخدم الحساسات وإمتى، بلغة واضحة — والمراجعة من هنا مباشرة.'),
    ...rows.map(([ic, name, count, color]) => h('div', { class: 'privacy__row' },
      h('span', { style: { color }, html: icon(ic, 'ico ico--sm') }),
      h('span', {}, name),
      h('b', {}, count),
      h('button', { onclick: (e) => { e.target.textContent = 'تم الإلغاء'; ctx.toast?.(`تم سحب صلاحية ${name}`); ctx.emit?.('defer'); } }, 'إلغاء'),
    )),
    h('div', { class: 'privacy__row' },
      h('span', { style: { color: 'var(--nv-mint)' }, html: icon('shield', 'ico ico--sm') }),
      h('span', {}, 'التشفير والتحقق من الإقلاع'),
      h('b', {}, 'مُفعّل'),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════
   الإعدادات — the control room: wallpaper, appearance, motion,
   sound and about. Everything persists on the device.
   ══════════════════════════════════════════════════════════════ */
function settingsContent(ctx) {
  const wallsWrap = h('div', {});
  const appearWrap = h('div', {});
  const motionWrap = h('div', {});
  const soundWrap = h('div', {});
  const launcherWrap = h('div', { class: 'set__sec', dataset: { launcherSettings: '1' } });
  let confirmHomeChange = false;
  function paintLauncher() {
    if (!isNativeLauncher()) return;
    const active = launcherState().def;
    launcherWrap.replaceChildren(
      h('div', { class: 'set__title' }, 'الواجهة الرئيسية'),
      h('p', { class: 'set__note', dataset: { launcherStatus: '1' } }, active
        ? 'NOVA هي الواجهة الرئيسية. زر الرجوع لا يغلقها. لتغيير الواجهة، استخدم الإعدادات.'
        : 'NOVA ليست الواجهة الرئيسية. فعّلها لتفتح عند الضغط على زر الرئيسية.'),
      h('p', { class: 'set__note' }, 'أندرويد يدير الذاكرة وإيقاف التطبيقات. NOVA لا تمنع الإيقاف الإجباري من إعدادات النظام.'),
    );
    if (confirmHomeChange && active) {
      launcherWrap.append(
        h('p', { class: 'set__note' }, 'اختر واجهة أخرى في إعدادات أندرويد. ستظل NOVA الواجهة الرئيسية حتى تغيّر اختيارك.'),
        h('button', { class: 'set__btn', dataset: { launcherConfirm: '1' }, onclick: () => {
          confirmHomeChange = false; paintLauncher(); openHomeSettings();
        } }, 'متابعة إلى إعدادات أندرويد'),
        h('button', { class: 'set__btn', dataset: { launcherCancel: '1' }, onclick: () => {
          confirmHomeChange = false; paintLauncher();
        } }, 'إلغاء'),
      );
    } else {
      launcherWrap.append(h('button', {
        class: 'set__btn', dataset: { launcherToggle: '1' }, onclick: () => {
          if (active) { confirmHomeChange = true; paintLauncher(); }
          else requestDefaultLauncher();
        },
      }, active ? 'تغيير الواجهة الرئيسية / إيقاف استخدام NOVA' : 'تفعيل NOVA كواجهة رئيسية'));
    }
  }
  const onLauncherState = () => { confirmHomeChange = false; paintLauncher(); };
  if (isNativeLauncher()) window.addEventListener('nova:launcher', onLauncherState);
  paintLauncher();

  function paintWalls() {
    const entries = Object.entries(WALLPAPERS)
      .filter(([, w]) => !w.native || isNativeLauncher());
    wallsWrap.replaceChildren(h('div', { class: 'set__walls' }, ...entries.map(([id, w]) => {
      const on = wallpaperId() === id || (wallpaperId() === 'dim' && id === 'dim');
      return h('button', {
        class: on ? 'set__wall set__wall--on' : 'set__wall',
        dataset: { wall: id },
        onclick: () => {
          if (id === 'custom' && !customImage()) {
            openImagePicker((ok) => {
              if (ok) { setWallpaper('custom'); ctx.toast?.('تم اختيار صورتك كخلفية'); ctx.emit?.('success'); paintWalls(); }
            });
            return;
          }
          setWallpaper(id);
          ctx.toast?.(`الخلفية: ${w.label}`);
          ctx.emit?.('tick');
          paintWalls();
        },
      },
        h('i', { class: 'set__swatch', style: { background: id === 'custom' && customImage()
          ? `url(${customImage()}) center/cover`
          : w.swatch } }),
        h('b', {}, w.label),
        h('small', {}, w.note),
      );
    })));

    const extras = [];
    if (isNativeLauncher()) {
      extras.push(h('button', {
        class: 'set__btn',
        onclick: () => { pickWallpaper(); ctx.emit?.('tick'); },
      }, h('span', { html: icon('gallery', 'ico ico--sm') }), h('span', {}, 'تغيير خلفية النظام نفسه')));
    }
    extras.push(h('button', {
      class: 'set__btn',
      onclick: () => {
        openImagePicker((ok) => {
          if (ok) { setWallpaper('custom'); ctx.toast?.('تم اختيار صورتك كخلفية'); ctx.emit?.('success'); paintWalls(); }
          else ctx.toast?.('لم يتم اختيار صورة');
        });
      },
    }, h('span', { html: icon('pluss', 'ico ico--sm') }), h('span', {}, 'اختر صورة من جهازك')));
    if (wallpaperId() === 'custom' && customImage()) {
      extras.push(h('button', {
        class: 'set__btn',
        onclick: () => { clearCustomImage(); setWallpaper('aurora'); paintWalls(); ctx.toast?.('تم حذف الصورة'); },
      }, h('span', { html: icon('close', 'ico ico--sm') }), h('span', {}, 'حذف صورتي والعودة لأورورا')));
    }
    wallsWrap.append(...extras);
  }

  function chipRow(entries, isActive, onPick) {
    return h('div', { class: 'set__chips' }, ...Object.entries(entries).map(([k, v]) => h('button', {
      class: isActive(k) ? 'set__chip set__chip--on' : 'set__chip',
      'aria-pressed': String(isActive(k)),
      onclick: () => { onPick(k); ctx.emit?.('tick'); },
    }, v.dot ? h('i', { class: 'set__dot', style: { background: v.dot } }) : null, h('span', {}, v.label || k))));
  }

  function paintAppearance() {
    appearWrap.replaceChildren(
      chipRow(
        { dark: { label: 'NOVA Dark' }, light: { label: 'NOVA Paper' } },
        (k) => nova.mode === k,
        (k) => { setMode(k); paintAppearance(); paintWalls(); },
      ),
      chipRow(
        Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, { label: v.label, dot: v.accent }])),
        (k) => nova.accent === k,
        (k) => { setAccent(k); paintAppearance(); },
      ),
    );
  }

  function paintMotion() {
    motionWrap.replaceChildren(
      chipRow(PROFILES, (k) => nova.profile === k, (k) => { setProfile(k); paintMotion(); }),
      chipRow(THEMES, (k) => nova.theme === k, (k) => { setTheme(k); paintMotion(); }),
      h('p', { class: 'set__note' }, `${PROFILES[nova.profile]?.note || ''} · ${THEMES[nova.theme]?.note || ''}`),
    );
  }

  function paintSound() {
    const on = soundOn();
    soundWrap.replaceChildren(h('div', { class: 'set__row' },
      h('span', { class: 'set__ico', html: icon('sound', 'ico') }),
      h('span', { class: 'set__meta' }, h('b', {}, 'صوت النظام'), h('span', {}, 'نقرات وهمسات NOVA')),
      h('button', {
        class: on ? 'set__toggle set__toggle--on' : 'set__toggle',
        'aria-pressed': String(on),
        onclick: () => { setSoundOn(!on); paintSound(); ctx.emit?.('tick'); ctx.toast?.(!on ? 'الصوت مُشغّل' : 'الصوت صامت'); },
      }, h('i', {})),
    ));
  }

  let alive = true;
  paintWalls(); paintAppearance(); paintMotion(); paintSound();
  const off = onWallpaperChange(() => { if (alive) paintWalls(); });

  const root = h('div', { class: 'set' },
    h('div', {
      class: 'set__head',
      title: 'اضغط لبريق NOVA OS',
      onclick: (e) => {
        const b = e.currentTarget.querySelector('.set__brand');
        if (b) {
          b.classList.remove('set__brand--shine');
          b.getBoundingClientRect(); // refire the shine from the start
          b.classList.add('set__brand--shine');
        }
        ctx.emit?.('tick');
      },
    },
      h('span', { class: 'set__logo' }, '◉'),
      h('div', { class: 'set__meta' }, h('b', {}, h('span', { class: 'set__brand', text: 'NOVA OS' })), h('span', {}, `v${NOVA_VERSION} · كل شيء على جهازك`)),
    ),

    isNativeLauncher() ? launcherWrap : null,
    h('div', { class: 'set__sec' }, h('div', { class: 'set__title' }, 'الخلفية', h('small', {}, 'غيّر شكل المساحة')), wallsWrap),
    h('div', { class: 'set__sec' }, h('div', { class: 'set__title' }, 'المظهر', h('small', {}, 'ليل أو نهار · لون التمييز')), appearWrap),
    h('div', { class: 'set__sec' }, h('div', { class: 'set__title' }, 'NOVA MOTION', h('small', {}, 'الحركة والفيزياء')), motionWrap),
    h('div', { class: 'set__sec' }, h('div', { class: 'set__title' }, 'الصوت', h('small', {}, 'اهتزاز دائم')), soundWrap),

    h('div', { class: 'set__sec' }, h('div', { class: 'set__title' }, 'حول NOVA', h('small', {}, 'التثبيت والتحديث')),
      h('div', { class: 'set__row' },
        h('span', { class: 'set__ico', html: icon('actions', 'ico') }),
        h('span', { class: 'set__meta' }, h('b', {}, 'الإصدار'), h('span', {}, `NOVA OS v${NOVA_VERSION}`)),
      ),
      h('button', {
        class: 'set__btn',
        onclick: () => { window.dispatchEvent(new CustomEvent('nova:open-install')); ctx.emit?.('open'); },
      }, h('span', { html: icon('pluss', 'ico ico--sm') }), h('span', {}, 'ثبّت NOVA على الهاتف (PWA / APK)')),
      h('button', {
        class: 'set__btn',
        onclick: () => {
          try {
            localStorage.removeItem('nova.wallpaper.v1');
            localStorage.removeItem('nova.config.v1');
            localStorage.removeItem('nova.sound.v1');
          } catch { /* ignore */ }
          ctx.toast?.('أُعيدت إعدادات المظهر للوضع الافتراضي — أعد فتح NOVA');
          ctx.emit?.('defer');
        },
      }, h('span', { html: icon('restart', 'ico ico--sm') }), h('span', {}, 'إعادة ضبط التخصيصات')),
    ),
  );

  let observer;
  const cleanup = () => {
    alive = false;
    off();
    window.removeEventListener('nova:launcher', onLauncherState);
    observer?.disconnect();
  };
  root.addEventListener('nova:teardown', cleanup, { once: true });
  try {
    observer = new MutationObserver(() => { if (!root.isConnected) cleanup(); });
    observer.observe(document.getElementById('screen') || document.body, { childList: true, subtree: true });
  } catch { /* ignore */ }
  return root;
}

/* ── the rest of the phone ─────────────────────────────────────── */

function phoneContent(ctx) {
  const display = h('div', { class: 'dial__display' }, 'اتصل برقم');
  let num = '';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  const press = (k) => {
    if (num === 'اتصل برقم') num = '';
    num += k;
    display.textContent = num;
    ctx.emit?.('tick');
  };
  return h('div', { class: 'dial' },
    display,
    h('div', { class: 'dial__keys' },
      ...keys.map((k) => h('button', { class: 'dial__key', onclick: () => press(k) }, k,
        h('small', {}, { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' }[k] || ''))),
    ),
    h('div', { class: 'dial__row' },
      h('button', {
        class: 'dial__call',
        onclick: () => {
          if (!num || num === 'اتصل برقم') { ctx.toast?.('اكتب رقمًا أولًا'); return; }
          ctx.emit?.('success');
          if (isNativeLauncher()) dialNumber(num);
          else ctx.toast?.(`جارٍ الاتصال بـ ${num}`);
        },
      }, h('span', { html: icon('phone', 'ico') })),
      h('button', {
        class: 'dial__key dial__key--sm',
        onclick: () => { num = num.slice(0, -1); display.textContent = num || 'اتصل برقم'; },
      }, '⌫'),
    ),
  );
}

function contactsContent(ctx) {
  const rows = [
    ...CONTACTS.filter((c) => c.kind === 'person').map((c) => ({ name: c.name, ini: c.initials, sub: 'جهة اتصال' })),
    { name: 'أحمد', ini: 'أ', sub: 'العمل' },
    { name: 'مي', ini: 'م', sub: 'العائلة' },
    { name: 'د. خالد', ini: 'خ', sub: 'العيادة' },
  ];
  return h('div', { class: 'cnt' },
    h('div', { class: 'cnt__row cnt__row--head' }, h('span', {}, 'الكل · 8'), h('small', {}, 'مرتبة حسب آخر تواصل')),
    ...rows.map((r, i) => h('div', { class: 'cnt__row' },
      h('span', { class: 'cnt__av', style: { background: gradient(i + 2) } }, r.ini),
      h('span', { class: 'cnt__meta' }, h('b', {}, r.name), h('span', {}, r.sub)),
      h('button', {
        class: 'cnt__call',
        onclick: () => { ctx.emit?.('success'); ctx.toast?.(`الاتصال بـ ${r.name}`); },
      }, h('span', { html: icon('phone', 'ico ico--sm') })),
    )),
  );
}

function cameraContent(ctx) {
  return h('div', { class: 'cam' },
    h('div', { class: 'cam__modes' }, 'فيديو · صورة · بورتريه'),
    h('div', { class: 'cam__view' }, h('div', { class: 'cam__grid-lines' }), h('span', { class: 'cam__focus' })),
    h('div', { class: 'cam__strip' }, ...Array.from({ length: 5 }, (_, i) => h('i', { class: 'cam__thumb', style: { background: gradient(i + 5) } }))),
    h('button', {
      class: 'cam__shutter',
      onclick: (e) => {
        ctx.emit?.('success');
        ctx.toast?.('تم حفظ الصورة في المعرض');
        const v = e.currentTarget.closest('.cam')?.querySelector('.cam__view');
        if (v) { v.dataset.flash = '1'; setTimeout(() => { delete v.dataset.flash; }, 180); }
      },
    }, h('i', {})),
  );
}

/* ══════════════════════════════════════════════════════════════
   البكرات (Reels) — short clips that really play: the clip
   auto-progresses, the feed moves by swipe or arrow, double-tap
   likes. Playing is real media state — live events become orbs
   and never interrupt the clip (docs/01 §7).
   ══════════════════════════════════════════════════════════════ */
const REELS = [
  { t: 'رحلة الغردقة', emo: '🌊', by: 'سارة', cap: 'أول يوم على البحر 🌊', likes: 243, cm: 18, dur: 6 },
  { t: 'حفل NOVA', emo: '🎤', by: 'فريق NOVA', cap: 'لقطات من حفل الإطلاق ✨', likes: 512, cm: 64, dur: 7 },
  { t: 'يوم في المزرعة', emo: '🌾', by: 'آدم', cap: 'هدوء الصبح في المزرعة', likes: 97, cm: 9, dur: 5 },
  { t: 'تقرير الألعاب', emo: '🎮', by: 'NOVA PLAY', cap: 'أسرع ألعاب هذا الأسبوع 🎮', likes: 320, cm: 41, dur: 6 },
  { t: 'جلسة تصوير', emo: '📸', by: 'ليلى', cap: 'خلف الكواليس 📸', likes: 180, cm: 12, dur: 5 },
  { t: 'وقت الغروب', emo: '🌅', by: 'محمد', cap: 'الغروب من شرفة البيت 🌅', likes: 428, cm: 27, dur: 6 },
];

function reelFeed(ctx, at = 0) {
  const N = REELS.length;
  let idx = ((at % N) + N) % N;
  let p = 0;
  let playing = true;
  let tapAt = 0;
  let tapTimer = 0;
  let suppressClick = false;
  const liked = new Set();

  /* ── the clip ─────────────────────────────────────────────── */
  const fill = h('b', {});
  const bar = h('div', { class: 'reel__bar' }, fill);
  const film = h('div', { class: 'reel__film' });
  const emo = h('div', { class: 'reel__emo' }, '🌊');
  const scene = h('div', { class: 'reel__scene' }, film, emo);
  const stack = h('div', { class: 'reel__stack', dataset: { drag: 'reel' } }, scene);
  const glyph = h('div', { class: 'reel__glyph' });

  /* ── meta + actions ───────────────────────────────────────── */
  const who = h('b', {}, '');
  const cap = h('span', {}, '');
  const av = h('span', { class: 'reel__av' });
  const audioBy = h('small', {}, '');
  const meta = h('div', { class: 'reel__meta' },
    av,
    h('div', { class: 'reel__txt' }, who, cap, h('div', { class: 'reel__audio' }, '♪ صوت أصلي — ', audioBy)));

  const likeCnt = h('span', { class: 'reel__cnt' }, '0');
  const likeBtn = h('button', {
    class: 'reel__act', dataset: { nodrag: '1' }, title: 'إعجاب',
    onclick: () => toggleLike(),
  }, h('span', { html: icon('heart', 'ico ico--sm') }), likeCnt);
  const cmCnt = h('span', { class: 'reel__cnt' }, '0');
  const cmBtn = h('button', {
    class: 'reel__act', dataset: { nodrag: '1' }, title: 'تعليقات',
    onclick: () => { ctx.emit?.('tick'); ctx.toast?.('التعليقات على البكرة'); },
  }, h('span', {}, '💬'), cmCnt);
  const shareBtn = h('button', {
    class: 'reel__act', dataset: { nodrag: '1' }, title: 'مشاركة',
    onclick: () => { ctx.emit?.('success'); ctx.toast?.('تمت مشاركة البكرة'); },
  }, h('span', {}, '↗'), h('span', { class: 'reel__cnt' }, 'مشاركة'));
  const side = h('div', { class: 'reel__side' }, likeBtn, cmBtn, shareBtn);

  const navBtn = (cls, dir) => h('button', {
    class: `reel__nav ${cls}`, dataset: { nodrag: '1' }, html: icon('chevron', 'ico ico--sm'),
    onclick: () => go(dir),
  });
  const prevBtn = navBtn('reel__nav--prev', -1);
  const nextBtn = navBtn('reel__nav--next', 1);

  const el = h('div', { class: 'reel' }, bar, stack, meta, side, prevBtn, nextBtn, glyph);

  /* ── state ────────────────────────────────────────────────── */
  function paint() {
    const r = REELS[idx];
    film.style.background = gradient(idx + 8);
    emo.textContent = r.emo;
    av.style.background = gradient(idx + 1);
    who.textContent = r.by;
    cap.textContent = r.cap;
    audioBy.textContent = r.by;
    cmCnt.textContent = String(r.cm);
    const on = liked.has(idx);
    likeBtn.classList.toggle('reel__act--on', on);
    likeCnt.textContent = String(r.likes + (on ? 1 : 0));
    fill.style.transform = `scaleX(${p})`;
  }

  function setPlaying(v) {
    playing = v;
    el.classList.toggle('reel--paused', !v);
    glyph.innerHTML = icon(v ? 'pause' : 'play', 'ico');
    glyph.dataset.flash = '1';
    setTimeout(() => { delete glyph.dataset.flash; }, 450);
    ctx.onMedia?.(v);
  }

  function toggleLike(force) {
    const on = force === true ? true : !liked.has(idx);
    if (on) liked.add(idx); else liked.delete(idx);
    paint();
    if (on) {
      const heart = h('span', { class: 'reel__heart' }, '❤️');
      stack.append(heart);
      setTimeout(() => heart.remove(), 950);
      ctx.emit?.('success');
    } else ctx.emit?.('close');
  }

  function go(dir) {
    idx = (idx + dir + N) % N;
    p = 0;
    paint();
    stack.style.transform = '';
    stack.classList.remove('reel__snap', 'reel__in-up', 'reel__in-down');
    void stack.offsetWidth;
    stack.classList.add(dir > 0 ? 'reel__in-up' : 'reel__in-down');
    ctx.emit?.('tick');
  }

  /* ── gestures: one tap plays/pauses · double-tap likes ·
        vertical swipe moves in the feed ───────────────────────── */
  stack.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    const now = Date.now();
    if (now - tapAt < 260) { clearTimeout(tapTimer); tapAt = 0; toggleLike(true); return; }
    tapAt = now;
    tapTimer = setTimeout(() => setPlaying(!playing), 250);
  });

  draggable(stack, {
    axis: 'y',
    onMove: (e, s) => {
      stack.style.transform = `translate3d(0, ${(s.dy * 0.55).toFixed(1)}px, 0)`;
    },
    onEnd: (e, s) => {
      suppressClick = true;
      if (s.dy <= -46) { go(1); return; }
      if (s.dy >= 46) { go(-1); return; }
      stack.classList.add('reel__snap');
      stack.style.transform = '';
      setTimeout(() => stack.classList.remove('reel__snap'), 300);
    },
  });

  /* ── the playhead: auto-advance, self-cleaning ────────────── */
  const timer = setInterval(() => {
    if (!el.isConnected) { clearInterval(timer); clearTimeout(tapTimer); ctx.onMedia?.(false); return; }
    if (!playing) return;
    p += 90 / (REELS[idx].dur * 1000);
    if (p >= 1) { p = 0; go(1); return; }
    fill.style.transform = `scaleX(${p})`;
  }, 90);

  paint();
  setTimeout(() => ctx.onMedia?.(true), 0);

  return {
    el,
    destroy: () => { clearInterval(timer); clearTimeout(tapTimer); ctx.onMedia?.(false); },
  };
}

function videoContent(ctx) {
  const stage = h('div', { class: 'vid__stage' });
  let feed = null;
  const tabs = {};

  function library() {
    return h('div', { class: 'vid__grid' }, ...REELS.map((r, i) => h('button', {
      class: 'vid__card',
      dataset: { reel: String(i) },
      style: { background: gradient(i + 8) },
      onclick: () => show('reels', i),
    },
      h('span', { class: 'vid__play', html: icon('play', 'ico ico--sm') }),
      h('small', {}, r.t))));
  }

  function show(tab, at = 0) {
    for (const k of Object.keys(tabs)) tabs[k].setAttribute('aria-pressed', String(k === tab));
    feed?.destroy?.();
    feed = null;
    if (tab === 'reels') {
      feed = reelFeed(ctx, at);
      stage.replaceChildren(feed.el);
    } else {
      ctx.onMedia?.(false);
      stage.replaceChildren(library());
    }
  }

  tabs.reels = h('button', { class: 'vid__tab', onclick: () => show('reels', 0) }, 'البكرات');
  tabs.lib = h('button', { class: 'vid__tab', onclick: () => show('lib') }, 'المكتبة');
  show('reels', 0);

  return h('div', { class: 'vid' },
    h('div', { class: 'vid__tabs' }, tabs.reels, tabs.lib),
    stage,
  );
}

function mailContent() {
  const rows = [
    ['NOVA', 'تحديث 0.5: خلفيات حيّة', 'خصّص مساحتك بالكامل من الإعدادات…', true],
    ['سارة', 'صور الرحلة 📷', 'بعتلك أحسن 12 صورة…', true],
    ['الفريق', 'خطة الأسبوع', 'ملخص الاجتماع مرفق…', true],
    ['المتجر', '12 تطبيقًا بانتظار تحديث', 'حدّث كل تطبيقاتك دفعة واحدة…', false],
    ['النشرة', 'كل جديد في NOVA MOTION', 'فيزياء جديدة للإيماءات…', false],
  ];
  return h('div', { class: 'mail' }, ...rows.map(([from, subject, preview, fresh], i) => h('div', { class: 'mail__row' },
    h('span', { class: 'mail__av', style: { background: gradient(i + 1) } }, from.slice(0, 1)),
    fresh ? h('i', { class: 'mail__dot' }) : h('span', { class: 'mail__dot mail__dot--seen' }),
    h('span', { class: 'cnt__meta' }, h('b', {}, subject), h('span', {}, `${from} · ${preview}`)),
  )));
}

function calendarContent() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pad = (first.getDay() + 6) % 7; // week starts Monday
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(h('i', { class: 'cal__day cal__day--pad' }));
  for (let d = 1; d <= days; d++) {
    const ev = [3, 9, 14, 21, 27].includes(d);
    cells.push(h('b', {
      class: d === now.getDate() ? 'cal__day cal__day--on' : (ev ? 'cal__day cal__day--ev' : 'cal__day'),
    }, String(d)));
  }
  return h('div', { class: 'cal' },
    h('div', { class: 'cal__grid' }, ...cells),
    h('div', { class: 'cal__events' },
      h('div', { class: 'cal__event' }, h('i', { style: { background: 'var(--nv-accent)' } }), h('b', {}, 'اجتماع الفريق'), h('small', {}, '2:30 — 3:15')),
      h('div', { class: 'cal__event' }, h('i', { style: { background: 'var(--nv-mint)' } }), h('b', {}, 'عشاء مع سارة'), h('small', {}, '8:00 مساءً')),
    ),
  );
}

function clockContent() {
  const time = h('div', { class: 'clk__time' }, '00:00:00');
  const date = h('div', { class: 'clk__date' }, '');
  const tick = () => {
    if (!time.isConnected) return true; // caller stops the interval
    const d = new Date();
    time.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0')).join(':');
    date.textContent = d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
    return false;
  };
  tick();
  const timer = setInterval(() => { if (tick()) clearInterval(timer); }, 1000);
  return h('div', { class: 'clk' },
    time,
    date,
    h('div', { class: 'clk__alarms' },
      h('div', { class: 'clk__alarm' }, h('b', {}, '06:30'), h('span', {}, 'الاستيقاظ · يوميًا'), h('i', { class: 'set__toggle set__toggle--on' }, h('i', {}))),
      h('div', { class: 'clk__alarm' }, h('b', {}, '07:45'), h('span', {}, 'تمرين الصباح'), h('i', { class: 'set__toggle set__toggle--on' }, h('i', {}))),
    ),
  );
}

function calcContent(ctx) {
  const tape = h('div', { class: 'calc__tape' });
  const display = h('div', { class: 'calc__display' }, '0');
  const st = { cur: '0', acc: null, op: null, fresh: true, history: [] };
  const show = () => { display.textContent = st.cur.length > 12 ? Number(st.cur).toExponential(5) : st.cur; };
  const paintTape = () => {
    tape.replaceChildren(...st.history.slice(0, 4).map((line) => h('div', { class: 'calc__line' }, line)));
  };
  paintTape();
  const apply = (a, b, op) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? (b === 0 ? NaN : a / b) : b);
  const num = (k) => {
    if (st.fresh) { st.cur = k === '.' ? '0.' : k; st.fresh = false; }
    else if (k === '.' ? !st.cur.includes('.') : st.cur.length < 12) st.cur += k;
    show();
  };
  const oper = (op) => {
    if (st.op && !st.fresh) {
      const r = apply(Number(st.acc), Number(st.cur), st.op);
      st.cur = String(r); st.acc = r; show();
    } else st.acc = Number(st.cur);
    st.op = op; st.fresh = true;
  };
  const eq = () => {
    if (st.op == null) return;
    const r = apply(Number(st.acc), Number(st.cur), st.op);
    const line = `${st.acc} ${st.op} ${st.cur} = ${Number.isFinite(r) ? Math.round(r * 1e10) / 1e10 : 'خطأ'}`;
    st.history.unshift(line);
    st.history = st.history.slice(0, 12);
    paintTape();
    st.cur = Number.isFinite(r) ? String(Math.round(r * 1e10) / 1e10) : 'خطأ';
    st.acc = null; st.op = null; st.fresh = true;
    show();
    ctx.emit?.('success');
  };
  const key = (label, cls, fn) => h('button', { class: `calc__key ${cls}`, onclick: fn }, label);
  return h('div', { class: 'calc' },
    tape,
    display,
    h('div', { class: 'calc__pad' },
      key('C', 'calc__key--op', () => { st.cur = '0'; st.acc = null; st.op = null; st.fresh = true; show(); }),
      key('⌫', 'calc__key--op', () => { st.cur = st.cur.length > 1 ? st.cur.slice(0, -1) : '0'; show(); }),
      key('%', 'calc__key--op', () => { st.cur = String(Number(st.cur) / 100); show(); }),
      key('÷', 'calc__key--op', () => oper('÷')),
      ...['7', '8', '9'].map((d) => key(d, '', () => num(d))),
      key('×', 'calc__key--op', () => oper('×')),
      ...['4', '5', '6'].map((d) => key(d, '', () => num(d))),
      key('−', 'calc__key--op', () => oper('−')),
      ...['1', '2', '3'].map((d) => key(d, '', () => num(d))),
      key('+', 'calc__key--op', () => oper('+')),
      key('0', '', () => num('0')),
      key('.', '', () => num('.')),
      key('=', 'calc__key--eq', eq),
    ),
  );
}

function weatherContent() {
  const days = [['اليوم', '24°', 'صحو'], ['غدًا', '26°', 'مشمس'], ['الأربعاء', '22°', 'غائم'], ['الخميس', '20°', 'مطر'], ['الجمعة', '23°', 'صحو']];
  return h('div', { class: 'wtr' },
    h('div', { class: 'wtr__now' },
      h('span', { class: 'wtr__big' }, '24°'),
      h('div', { class: 'cnt__meta' }, h('b', {}, 'القاهرة'), h('span', {}, 'صحو جزئيًا · تشعر بـ 26°')),
    ),
    h('div', { class: 'wtr__days' }, ...days.map(([d, t, c], i) => h('div', { class: 'wtr__day' },
      h('span', {}, d), h('span', { style: { color: i === 0 ? 'var(--nv-accent)' : 'var(--nv-text-2)' } }, c), h('b', {}, t),
    ))),
  );
}

function newsContent() {
  const rows = [
    ['NOVA OS يضيف خلفيات حيّة قابلة للتخصيص', 'تقنية · قبل 12 دقيقة'],
    ['فيزياء الحركة الجديدة تصل إلى كل التطبيقات', 'تقنية · قبل ساعة'],
    ['دليل: كيف تحوّل NOVA إلى واجهة هاتفك الأساسية', 'دليل · اليوم'],
    ['أفضل 10 تطبيقات هذا الأسبوع في متجر NOVA', 'تطبيقات · اليوم'],
  ];
  return h('div', { class: 'news' }, ...rows.map(([t, m], i) => h('div', { class: 'news__row' },
    h('i', { class: 'news__img', style: { background: gradient(i + 4) } }),
    h('span', { class: 'cnt__meta' }, h('b', {}, t), h('span', {}, m)),
  )));
}

function podcastContent(ctx) {
  const rows = [
    ['داخل NOVA MOTION', 'الحلقة 12 · 38 دقيقة', true],
    ['تصميم الأنظمة', 'الحلقة 8 · 44 دقيقة', false],
    ['صباح التقنية', 'موجز اليوم · 12 دقيقة', false],
  ];
  return h('div', { class: 'pod' }, ...rows.map(([t, m, on], i) => h('div', { class: 'pod__row' },
    h('i', { class: 'pod__art', style: { background: gradient(i + 7) } }, '◉'),
    h('span', { class: 'cnt__meta' }, h('b', {}, t), h('span', {}, m)),
    h('button', {
      class: on ? 'pod__play pod__play--on' : 'pod__play',
      onclick: (e) => {
        e.currentTarget.classList.toggle('pod__play--on');
        ctx.emit?.('tick');
        ctx.toast?.(on ? 'استئناف من 12:04' : 'جارٍ التشغيل');
      },
    }, h('span', { html: icon('play', 'ico ico--sm') })),
  )));
}

function booksContent() {
  const rows = [['فيزياء الأشياء الصغيرة', '64%'], ['لغة الأشكال', '22%'], ['النظام اللطيف', 'مقابلة'], ['مساحة مفتوحة', 'جديد']];
  return h('div', { class: 'bks' },
    h('div', { class: 'bks__grid' }, ...rows.map(([t, p], i) => h('div', { class: 'bks__card' },
      h('i', { style: { background: gradient(i + 3) } }),
      h('b', {}, t),
      h('small', {}, p),
    ))),
  );
}

function tasksContent(ctx) {
  const DEFAULT_TASKS = [
    ['مراجعة منحنى الربيع', false], ['تجربة الإيماءات', false], ['مكالمة التصميم', true],
    ['تحديث خطة الأسبوع', true], ['إرسال التقرير', false],
  ];
  /* persisted: the checkmark survives a reload */
  const items = loadJSON(PERSIST.tasks, null) || DEFAULT_TASKS.map(([t, done]) => ({ t, done }));
  const save = () => saveJSON(PERSIST.tasks, items);
  save();

  const root = h('div', { class: 'tsk' });
  const input = h('input', {
    class: 'tsk__in', placeholder: 'مهمة جديدة…', dataset: { nodrag: '1' },
    onkeydown: (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        items.unshift({ t: e.target.value.trim(), done: false });
        e.target.value = '';
        save(); render();
        ctx.emit?.('success');
      }
    },
  });
  const addRow = h('div', { class: 'tsk__add' },
    h('i', { class: 'tsk__check tsk__check--add', html: icon('pluss', 'ico ico--sm') }),
    input,
  );

  function render() {
    const rows = items.map((it, i) => {
      const row = h('button', {
        class: it.done ? 'tsk__row tsk__row--done' : 'tsk__row',
        onclick: () => {
          it.done = !it.done;
          save();
          row.classList.toggle('tsk__row--done', it.done);
          ctx.emit?.(it.done ? 'success' : 'tick');
        },
      }, h('i', { class: 'tsk__check', html: icon('check', 'ico ico--sm') }), h('span', {}, it.t));
      void i;
      return row;
    });
    const done = items.filter((x) => x.done).length;
    root.replaceChildren(
      addRow,
      h('div', { class: 'tsk__count' }, `${done} من ${items.length} منجزة`),
      ...rows,
    );
  }
  render();
  return root;
}

function storeContent(ctx) {
  const rows = [['لوح', 'تصميم · 4.8', 'gallery'], ['موجة', 'موسيقى · 4.6', 'music'], ['سديم', 'خلفيات · 4.9', 'actions'], ['زمن', 'إنتاجية · 4.7', 'clock']];
  return h('div', { class: 'stp' },
    h('div', { class: 'stp__grid' }, ...rows.map(([n, m, ic], i) => h('div', { class: 'stp__card' },
      h('span', { class: 'stp__ico', style: { background: gradient(i + 6) }, html: icon(ic, 'ico') }),
      h('b', {}, n),
      h('small', {}, m),
      h('button', {
        class: 'stp__get',
        onclick: (e) => { e.currentTarget.textContent = 'مثبَّت ✓'; ctx.emit?.('success'); ctx.toast?.(`تم تثبيت ${n}`); },
      }, 'تثبيت'),
    ))),
  );
}

function walletContent() {
  const rows = [['مقهى NOVA', 'اليوم · 11:30', '− 68 ج.م'], ['المترو', 'اليوم · 8:15', '− 12 ج.م'], ['مرتب سبتمبر', 'أمس', '+ 18,000 ج.م'], ['متجر التطبيقات', 'أمس', '− 45 ج.م']];
  return h('div', { class: 'wal' },
    h('div', { class: 'wal__card' },
      h('small', {}, 'بطاقة NOVA'),
      h('div', { class: 'wal__bal' }, '2,480.55 ج.م'),
      h('span', {}, '•••• 2049'),
    ),
    h('div', { class: 'wal__rows' }, ...rows.map(([t, m, v]) => h('div', { class: 'wal__row' },
      h('span', { class: 'cnt__meta' }, h('b', {}, t), h('span', {}, m)),
      h('b', { style: { color: v.startsWith('+') ? 'var(--nv-mint)' : 'var(--nv-text)' } }, v),
    ))),
  );
}

function healthContent() {
  return h('div', { class: 'hlt' },
    h('div', { class: 'hlt__rings' },
      h('div', { class: 'hlt__ring' }, h('b', {}, '7,200'), h('small', {}, 'خطوة')),
      h('div', { class: 'hlt__ring' }, h('b', {}, '1.8'), h('small', {}, 'لتر ماء')),
      h('div', { class: 'hlt__ring' }, h('b', {}, '7:12'), h('small', {}, 'نوم')),
    ),
    h('div', { class: 'wal__rows' },
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'نبض القلب'), h('span', {}, 'آخر قياس اليوم')), h('b', {}, '72')),
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'الطاقة'), h('span', {}, 'نشاط اليوم')), h('b', {}, '86%')),
    ),
  );
}

function fitnessContent(ctx) {
  const rows = [['إحماء', '5 دقائق'], ['قوة علوية', '18 دقيقة'], ['كارديو', '9 دقائق'], ['إطالة', '4 دقائق']];
  return h('div', { class: 'fit' },
    h('div', { class: 'fit__hero' }, h('b', {}, 'تمرين اليوم'), h('span', {}, '32 دقيقة · متوسط الشدة')),
    ...rows.map(([t, m]) => h('div', { class: 'fit__row' }, h('span', { html: icon('bolt', 'ico ico--sm') }), h('b', {}, t), h('small', {}, m))),
    h('button', {
      class: 'set__btn',
      onclick: () => { ctx.emit?.('success'); ctx.toast?.('بدأ التمرين — بالتوفيق!'); },
    }, h('span', { html: icon('play', 'ico ico--sm') }), h('span', {}, 'ابدأ التمرين')),
  );
}

function gamesContent() {
  const rows = [['مدار', 'أركيد'], ['شطرنج NOVA', 'ذهن'], ['سباق الفضاء', 'أكشن']];
  return h('div', { class: 'gam' },
    h('div', { class: 'gam__grid' }, ...rows.map(([n, g], i) => h('div', { class: 'gam__card', style: { background: gradient(i + 9) } },
      h('span', { class: 'vid__play', html: icon('game', 'ico ico--sm') }),
      h('b', {}, n),
      h('small', {}, g),
    ))),
  );
}

function socialContent(ctx) {
  const posts = [
    ['سارة', 'صور رحلة الغردقة جاهزة 🌊', 24, 6],
    ['محمد', 'حد جرب الخلفيات الجديدة في NOVA؟', 48, 12],
    ['فريق NOVA', 'التحديث الجديد متاح للجميع ✨', 132, 40],
  ];
  return h('div', { class: 'soc' }, ...posts.map(([who, text, likes, comments], i) => h('div', { class: 'soc__post' },
    h('div', { class: 'event-card__top' },
      h('span', { class: 'soc__av', style: { background: gradient(i + 1) } }, who.slice(0, 1)),
      h('span', { class: 'who' }, who),
    ),
    h('p', {}, text),
    h('div', { class: 'soc__acts' },
      h('button', { onclick: (e) => { e.currentTarget.textContent = `♥ ${likes + 1}`; ctx.emit?.('success'); } }, `♥ ${likes}`),
      h('button', {}, `💬 ${comments}`),
    ),
  )));
}

function meetingsContent(ctx) {
  const rows = [['اجتماع الفريق', '2:30 — 3:15', true], ['مراجعة التصميم', '4:00 — 4:45', false], ['ندوة NOVA MOTION', 'غدًا · 11:00', false]];
  return h('div', { class: 'mtg' }, ...rows.map(([t, m, soon]) => h('div', { class: 'mtg__row' },
    h('span', { class: 'cnt__meta' }, h('b', {}, t), h('span', {}, m)),
    soon
      ? h('button', { class: 'mtg__join', onclick: () => { ctx.emit?.('success'); ctx.toast?.('انضممت للاجتماع'); } }, 'انضم')
      : h('small', {}, 'لاحقًا'),
  )));
}

function translateContent(ctx) {
  const out = h('div', { class: 'trn__out' }, 'A new way to use your phone');
  return h('div', { class: 'trn' },
    h('div', { class: 'trn__pane' }, h('small', {}, 'العربية'), h('p', {}, 'طريقة جديدة لاستخدام هاتفك')),
    h('button', {
      class: 'trn__swap',
      onclick: () => { ctx.emit?.('tick'); ctx.toast?.('بدّلنا الاتجاه'); },
    }, h('span', { html: icon('translate', 'ico ico--sm') }), h('span', {}, 'بدّل')),
    h('div', { class: 'trn__pane' }, h('small', {}, 'English'), out),
  );
}

function recorderContent(ctx) {
  return h('div', { class: 'rec' },
    h('div', { class: 'rec__wave' }, ...Array.from({ length: 22 }, (_, i) => h('i', { style: { height: `${18 + ((i * 37) % 46)}%` } }))),
    h('button', {
      class: 'rec__btn',
      onclick: (e) => {
        const on = e.currentTarget.classList.toggle('rec__btn--on');
        e.currentTarget.textContent = on ? 'إيقاف' : 'تسجيل';
        ctx.emit?.(on ? 'open' : 'success');
        ctx.toast?.(on ? 'جارٍ التسجيل…' : 'تم حفظ التسجيل');
      },
    }, 'تسجيل'),
    h('div', { class: 'wal__rows' },
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'اجتماع الأمس'), h('span', {}, '24:18')), h('small', {}, '▶')),
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'فكرة أغنية'), h('span', {}, '1:02')), h('small', {}, '▶')),
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'مذكرة صوتية'), h('span', {}, '0:47')), h('small', {}, '▶')),
    ),
  );
}

function passwordsContent(ctx) {
  const rows = [['nova.os', 'adam@nova.os'], ['بريد العمل', 'adam@mail.eg'], ['بنك NOVA', 'adam-bank'], ['المتجر', 'adam@store']];
  return h('div', { class: 'pwd' },
    h('p', { class: 'set__note' }, 'كلمات مرورك مشفّرة على جهازك ولا تغادره أبدًا.'),
    ...rows.map(([t, u]) => {
      const val = h('span', { class: 'pwd__val' }, '••••••••');
      return h('div', { class: 'pwd__row' },
        h('span', { class: 'cnt__meta' }, h('b', {}, t), h('span', {}, u)),
        val,
        h('button', {
          class: 'cnt__call',
          onclick: (e) => {
            const shown = val.textContent === '••••••••';
            val.textContent = shown ? 'NOVA-2049-✨' : '••••••••';
            e.currentTarget.dataset.reveal = shown ? '1' : '0';
            ctx.emit?.('tick');
          },
        }, h('span', { html: icon('shield', 'ico ico--sm') })),
      );
    }),
  );
}

function cloudContent() {
  return h('div', { class: 'cld' },
    h('div', { class: 'cld__meter' },
      h('div', { class: 'cld__bar' }, h('i', { style: { width: '55%' } })),
      h('small', {}, '8.2 جيجا من 15 جيجا مستخدمة'),
    ),
    h('div', { class: 'wal__rows' },
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'الصور'), h('span', {}, '4.1 جيجا')), h('small', {}, 'مزامنة ✓')),
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'الملفات'), h('span', {}, '2.7 جيجا')), h('small', {}, 'مزامنة ✓')),
      h('div', { class: 'wal__row' }, h('span', { class: 'cnt__meta' }, h('b', {}, 'النسخ الاحتياطي'), h('span', {}, '1.4 جيجا')), h('small', {}, 'اليوم')),
    ),
  );
}

function iotContent(ctx) {
  const rows = [['مصباح غرفة المعيشة', true], ['المكيّف · 24°', true], ['مكبر الصوت', false], ['قفل الباب الذكي', true]];
  return h('div', { class: 'iot' }, ...rows.map(([t, on]) => {
    const toggle = h('button', {
      class: on ? 'iot__toggle iot__toggle--on' : 'iot__toggle',
      'aria-pressed': String(on),
      onclick: (e) => {
        const nowOn = e.currentTarget.classList.toggle('iot__toggle--on');
        e.currentTarget.setAttribute('aria-pressed', String(nowOn));
        ctx.emit?.(nowOn ? 'success' : 'close');
        ctx.toast?.(`${t}: ${nowOn ? 'مُشغّل' : 'مُطفأ'}`);
      },
    }, h('i', {}));
    return h('div', { class: 'iot__row' },
      h('span', { html: icon('bulb', 'ico ico--sm') }),
      h('span', { class: 'cnt__meta' }, h('b', {}, t)),
      toggle,
    );
  }));
}

function wearContent() {
  return h('div', { class: 'wer' },
    h('div', { class: 'wer__card' },
      h('span', { html: icon('clock', 'ico') }),
      h('span', { class: 'cnt__meta' }, h('b', {}, 'ساعة NOVA'), h('span', {}, 'متصلة الآن')),
      h('b', { class: 'wer__bat' }, '86%'),
    ),
    h('div', { class: 'wer__card' },
      h('span', { html: icon('bluetooth', 'ico') }),
      h('span', { class: 'cnt__meta' }, h('b', {}, 'سماعات NOVA بادز'), h('span', {}, 'في علبة الشحن')),
      h('b', { class: 'wer__bat' }, '62%'),
    ),
    h('div', { class: 'wer__card' },
      h('span', { html: icon('people', 'ico') }),
      h('span', { class: 'cnt__meta' }, h('b', {}, 'تابلت NOVA'), h('span', {}, 'قريب · نفس الحساب')),
      h('b', { class: 'wer__bat' }, '⌁'),
    ),
  );
}

function filesContent() {
  const rows = [['الصور', '1,204 عنصر', 'gallery'], ['المستندات', '86 ملفًا', 'notes'], ['التنزيلات', '34 ملفًا', 'files'], ['الموسيقى', '212 أغنية', 'music']];
  return h('div', { class: 'fle' },
    h('div', { class: 'cld__meter' },
      h('div', { class: 'cld__bar' }, h('i', { style: { width: '38%' } })),
      h('small', {}, '12.4 جيجا من 32 جيجا · 19.6 جيجا متاحة'),
    ),
    ...rows.map(([t, m, ic], i) => h('div', { class: 'wal__row' },
      h('span', { class: 'stp__ico', style: { background: gradient(i + 2) }, html: icon(ic, 'ico ico--sm') }),
      h('span', { class: 'cnt__meta' }, h('b', {}, t), h('span', {}, m)),
      h('span', { html: icon('chevron', 'ico ico--sm') }),
    )),
  );
}

function genericContent(meta, ctx) {
  return h('div', { class: 'simple' },
    h('h3', {}, meta.title || meta.name),
    h('p', {}, meta.titleSub || meta.sub || ''),
    h('p', {}, `${meta.name} جاهز ويعمل داخل مساحة NOVA — كل شيء مترابط مع FLOW وCORE وCANVAS.`),
    h('div', { class: 'line', style: { width: '86%' } }),
    h('div', { class: 'line', style: { width: '68%' } }),
    h('div', { class: 'line', style: { width: '76%' } }),
    h('div', { class: 'simple__acts' },
      h('button', { class: 'simple__chip', onclick: () => { ctx.emit?.('tick'); ctx.toast?.(`مشاركة من ${meta.name}`); } }, 'مشاركة'),
      h('button', { class: 'simple__chip', onclick: () => { ctx.emit?.('success'); ctx.toast?.(`أُضيف ${meta.name} إلى المساحة`); } }, 'أضف للمساحة'),
    ),
  );
}

/* ── الطرفية — a command line for the whole system ─────────────── */
function terminalContent(ctx) {
  const out = h('div', { class: 'term__out' });
  const input = h('input', {
    class: 'term__in', placeholder: 'اكتب help ثم Enter',
    autocomplete: 'off', spellcheck: 'false', dataset: { nodrag: '1' },
  });

  function print(line = '', cls = '') {
    out.append(h('div', { class: cls ? `term__line ${cls}` : 'term__line' }, line));
    out.scrollTop = out.scrollHeight;
  }

  function systemInfo() {
    const lines = [
      `NOVA OS ${NOVA_VERSION} · الإصدار الكامل`,
      `الحساب ....... nova@os`,
      `الوضع ....... ${nova.profile} / ${nova.theme} / ${nova.mode}`,
      `التطبيقات .... ${Object.keys(APPS).length} في الكتالوج`,
      `المساحة ...... ${state.windows.length} نافذة · ${state.events.length} حدث`,
      `عدم الإزعاج .. ${state.dnd ? 'مفعّل' : 'مطفأ'} · الصوت ${soundOn() ? 'مسموع' : 'صامت'}`,
      `الجهاز ....... ${navigator.platform || 'unknown'} · ${navigator.userAgent.includes('Mobile') ? 'هاتف' : 'حاسوب'}`,
    ];
    lines.forEach((l) => print(l));
  }

  function run(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    print(`› ${cmd}`, 'term__line--in');
    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');
    const k = head.toLowerCase();
    const alias = {
      مساعدة: 'help', إصدار: 'version', تاريخ: 'date', التطبيقات: 'apps',
      افتح: 'open', ثيم: 'theme', وضع: 'profile', خلفية: 'wallpaper',
      مسح: 'clear', نظام: 'neofetch',
    }[head] || k;

    switch (alias) {
      case 'help':
        print('help · version · date · apps · open <app> · theme <name> · profile <name>');
        print('wallpaper <id> · dnd on|off · sound on|off · echo <text> · clear · neofetch');
        break;
      case 'version': print(`NOVA OS ${NOVA_VERSION}`); break;
      case 'date': print(new Date().toString()); break;
      case 'apps': print(allAppIds().map((id) => APPS[id].name).join(' · ')); break;
      case 'open': {
        const target = Object.values(APPS).find((a) => a.id === arg || a.name === arg);
        if (target) { print(`فتح ${target.name}…`); ctx.openApp?.(target.id, null); }
        else print(`لا يوجد تطبيق باسم «${arg}»`, 'term__line--err');
        break;
      }
      case 'theme':
        if (THEMES[arg]) { setTheme(arg); print(`المحور: ${THEMES[arg].label}`); }
        else print(`الثيمات المتاحة: ${Object.keys(THEMES).join(' · ')}`, 'term__line--err');
        break;
      case 'profile':
        if (PROFILES[arg]) { setProfile(arg); print(`الوضع: ${PROFILES[arg].label}`); }
        else print(`الوضعات: ${Object.keys(PROFILES).join(' · ')}`, 'term__line--err');
        break;
      case 'wallpaper':
        if (WALLPAPERS[arg]) { setWallpaper(arg); print(`الخلفية: ${WALLPAPERS[arg].label}`); }
        else print(`المشاهد: ${Object.keys(WALLPAPERS).join(' · ')}`, 'term__line--err');
        break;
      case 'dnd': {
        const on = arg === 'on' || arg === 'on'.toLowerCase() || arg === 'نعم';
        const next = arg === 'off' ? false : arg === 'on' ? true : !state.dnd;
        setDnd(next); print(`عدم الإزعاج: ${next ? 'مفعّل' : 'مطفأ'}`);
        void on;
        break;
      }
      case 'sound': {
        const next = arg === 'off' ? false : arg === 'on' ? true : !soundOn();
        setSoundOn(next); print(`الصوت: ${next ? 'مسموع' : 'صامت'}`);
        break;
      }
      case 'echo': print(arg); break;
      case 'clear': out.replaceChildren(); break;
      case 'neofetch': systemInfo(); break;
      default: print(`أمر غير معروف: ${head} — جرّب help`, 'term__line--err');
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); run(input.value); input.value = ''; }
  });

  print(`NOVA OS ${NOVA_VERSION} — الطرفية`);
  print('اكتب help لأوامر النظام · لا شيء يغادر جهازك');

  return h('div', { class: 'term' }, out,
    h('form', {
      class: 'term__form', dataset: { nodrag: '1' },
      onsubmit: (e) => { e.preventDefault(); run(input.value); input.value = ''; },
    }, h('span', { class: 'term__prompt' }, '›'), input),
  );
}

/* ── NOVA FIND ─────────────────────────────────────────────────── */
function findContent(ctx) {
  const wrap = h('div', { class: 'nova-find-wrapper', style: { height: '100%', position: 'relative' } });
  setTimeout(() => {
    try {
      const { findEngine } = require('../nova/find/find.js');
      // Dynamic import fallback
      import('../nova/find/find.js').then(mod => {
        mod.findEngine.createSurface(wrap, {
          onSelect: (item) => {
            ctx.toast?.(`فتح ${item.title}`);
            if (item.action) {
              const action = item.action();
              if (action.type === 'openApp') {
                ctx.openApp?.(action.appId, null);
              } else if (action.type === 'openSettings') {
                ctx.openApp?.('settings', null);
              }
            }
          }
        });
      }).catch(() => {
        // Fallback simple search UI
        wrap.innerHTML = `
          <div style="padding: 20px;">
            <div style="display: flex; gap: 12px; padding: 14px; border-radius: 16px; background: var(--nv-glass); border: 1px solid var(--nv-line);">
              <span>◉</span>
              <input placeholder="ابحث..." style="flex:1; background:none; border:0; outline:none; color: var(--nv-text);" />
            </div>
            <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px;">
              ${Object.values(APPS).slice(0, 6).map(app => `
                <div style="padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.04); display: flex; gap: 10px; align-items: center;">
                  <span style="color: ${app.color}">◉</span>
                  <span>${app.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });
    } catch {
      // Simple fallback
    }
  }, 100);
  return wrap;
}

/* ── NOVA SPACES ───────────────────────────────────────────────── */
function spacesContent(ctx) {
  const wrap = h('div', { class: 'nova-spaces-wrapper', style: { height: '100%', overflow: 'auto' } });
  setTimeout(() => {
    import('../nova/spaces/spaces.js').then(mod => {
      mod.spacesManager.createSurface(wrap, {
        onSwitch: (space) => {
          ctx.toast?.(`تم التبديل إلى مساحة ${space.name}`);
        },
        onCreate: (space) => {
          ctx.toast?.(`تم إنشاء مساحة ${space.name}`);
        }
      });
    }).catch(() => {
      wrap.innerHTML = '<div style="padding: 20px;">مساحات NOVA — Work, Personal, Study, Travel, Gaming</div>';
    });
  }, 100);
  return wrap;
}

/* ── NOVA SECURITY ─────────────────────────────────────────────── */
function securityContent(ctx) {
  const wrap = h('div', { class: 'nova-security-wrapper', style: { height: '100%', overflow: 'auto' } });
  setTimeout(() => {
    import('../nova/security/security.js').then(mod => {
      mod.securityCenter.createSurface(wrap, {});
    }).catch(() => {
      wrap.innerHTML = `
        <div style="padding: 20px;">
          <h3>مركز الأمان</h3>
          <p>الأذونات · الخصوصية · التشفير · وصول التطبيقات</p>
          <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="padding: 12px; border-radius: 12px; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2);">
              🔒 التشفير مفعّل — file-based
            </div>
            <div style="padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.04);">
              📷 الكاميرا — 3 تطبيقات لديها إذن
            </div>
            <div style="padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.04);">
              🎤 الميكروفون — تطبيق واحد لديه إذن
            </div>
          </div>
        </div>
      `;
    });
  }, 100);
  return wrap;
}

/* ── NOVA AI ───────────────────────────────────────────────────── */
function aiContent(ctx) {
  const wrap = h('div', { class: 'nova-ai-wrapper', style: { height: '100%', position: 'relative' } });
  setTimeout(() => {
    import('../nova/ai/ai.js').then(mod => {
      mod.aiEngine.createSurface(wrap, {
        onAction: (action) => {
          ctx.toast?.(`AI: ${action.label}`);
          if (action.intent === 'openLastWorkspace') {
            ctx.toast?.('فتح آخر مساحة');
          } else if (action.intent === 'openSettings') {
            ctx.openApp?.('settings', null);
          }
        }
      });
    }).catch(() => {
      wrap.innerHTML = `
        <div style="padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 20px;">
          <div style="width: 80px; height: 80px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #6C5CE7, #22D3EE);"></div>
          <h3>NOVA AI</h3>
          <p style="text-align: center; color: var(--nv-text-2);">المساعد الذكي — جزء من النظام<br/>يمكنك الكتابة، التحدث، رفع ملف، طلب Action</p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button style="padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.06); font-size: 12px;">افتح آخر مساحة</button>
            <button style="padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.06); font-size: 12px;">ابحث عن الصور</button>
          </div>
        </div>
      `;
    });
  }, 100);
  return wrap;
}

/* ── NOVA CONTROL ──────────────────────────────────────────────── */
function controlContent(ctx) {
  return h('div', { class: 'simple', style: { padding: '20px' } },
    h('h3', {}, 'NOVA CONTROL'),
    h('p', {}, 'مركز التحكم — Glass Canvas مع عناصر تفاعلية'),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' } },
      h('div', { style: { padding: '16px', borderRadius: '16px', background: 'var(--nv-glass)', border: '1px solid var(--nv-line)', textAlign: 'center' } },
        h('div', { style: { width: '48px', height: '48px', borderRadius: '50%', background: '#6C5CE7', margin: '0 auto 8px', display: 'grid', placeItems: 'center', color: 'white' } }, '◉'),
        h('div', { style: { fontSize: '12px' } }, 'Wi-Fi Orb')
      ),
      h('div', { style: { padding: '16px', borderRadius: '16px', background: 'var(--nv-glass)', border: '1px solid var(--nv-line)', textAlign: 'center' } },
        h('div', { style: { width: '48px', height: '48px', borderRadius: '50%', border: '3px solid #22D3EE', margin: '0 auto 8px', display: 'grid', placeItems: 'center' } }, '72%'),
        h('div', { style: { fontSize: '12px' } }, 'Battery Ring')
      ),
      h('div', { style: { padding: '16px', borderRadius: '16px', background: 'var(--nv-glass)', border: '1px solid var(--nv-line)', textAlign: 'center' } },
        h('div', { style: { width: '60px', height: '30px', borderRadius: '15px 15px 0 0', border: '3px solid #F5A524', borderBottom: '0', margin: '0 auto 8px' } }, ''),
        h('div', { style: { fontSize: '12px' } }, 'Brightness Arc')
      ),
      h('div', { style: { padding: '16px', borderRadius: '16px', background: 'var(--nv-glass)', border: '1px solid var(--nv-line)', textAlign: 'center' } },
        h('div', { style: { width: '12px', height: '12px', borderRadius: '50%', background: '#FF6B9A', margin: '0 auto 8px' } }, ''),
        h('div', { style: { fontSize: '12px' } }, 'Airplane Node')
      )
    )
  );
}

/* ── NOVA CANVAS ENHANCED ──────────────────────────────────────── */
function canvasContent(ctx) {
  return h('div', { class: 'simple', style: { padding: '20px' } },
    h('h3', {}, 'NOVA CANVAS'),
    h('p', {}, 'تعدد المهام — Cards لها Depth, Shadow, Glass, Motion, Position'),
    h('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      ...state.windows.map(w => {
        const meta = appMeta(w.appId);
        return h('div', { 
          style: { 
            padding: '12px', 
            borderRadius: '14px', 
            background: 'var(--nv-glass)', 
            border: '1px solid var(--nv-line)',
            display: 'flex',
            gap: '10px',
            alignItems: 'center'
          } 
        },
          h('span', { style: { color: meta.color } }, '◉'),
          h('span', {}, meta.name),
          h('span', { style: { marginInlineStart: 'auto', fontSize: '11px', color: 'var(--nv-text-2)' } }, `x:${w.x} y:${w.y}`)
        );
      })
    )
  );
}

/* ── NOVA FLOW ENHANCED ────────────────────────────────────────── */
function flowContent(ctx) {
  return h('div', { class: 'simple', style: { padding: '20px' } },
    h('h3', {}, 'NOVA FLOW'),
    h('p', {}, 'نظام الإشعارات — Glass Event Card يظهر بطريقة Orb → Card → Event'),
    h('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      ...state.events.slice(0, 5).map(evt => 
        h('div', { 
          style: { 
            padding: '14px', 
            borderRadius: '16px', 
            background: 'var(--nv-glass)', 
            border: '1px solid var(--nv-line)',
            backdropFilter: 'blur(16px)'
          } 
        },
          h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
            h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: evt.color || 'var(--nv-accent)', display: 'block' } }),
            h('b', { style: { fontSize: '13px' } }, evt.who),
            h('small', { style: { marginInlineStart: 'auto', color: 'var(--nv-text-2)', fontSize: '11px' } }, new Date(evt.t).toLocaleTimeString('ar'))
          ),
          h('div', { style: { fontSize: '13px', marginTop: '8px', lineHeight: '1.6' } }, evt.body),
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
            ...(evt.actions || []).map(action => 
              h('button', { 
                style: { 
                  padding: '6px 12px', 
                  borderRadius: '999px', 
                  background: 'rgba(255,255,255,0.06)', 
                  border: '1px solid var(--nv-line)',
                  fontSize: '11px'
                } 
              }, action)
            )
          )
        )
      )
    )
  );
}

/* ── full surface ──────────────────────────────────────────────── */
export function buildApp(appId, ctx = {}) {
  const meta = appMeta(appId);
  const body = h('div', { class: 'app__body' }, contentFor(appId, ctx));

  const collapse = h('button', {
    class: 'app__collapse',
    dataset: { nodrag: '1' },
    title: 'تصغير إلى NOVA CANVAS',
    html: icon('layers', 'ico ico--sm'),
    onclick: () => ctx.onCollapse?.(),
  });

  const close = h('button', {
    class: 'app__close',
    dataset: { nodrag: '1' },
    title: 'إغلاق',
    html: icon('close', 'ico ico--sm'),
    onclick: () => ctx.onHome?.(),
  });

  const chrome = h('div', { class: 'app__chrome' },
    h('span', { style: { color: meta.color }, html: icon(meta.icon, 'ico') }),
    h('span', { class: 't' }, h('b', {}, meta.title || meta.name), h('span', {}, meta.titleSub || meta.sub)),
    collapse,
    close,
  );

  const el = h('div', { class: 'app', dataset: { app: appId }, style: { '--nv-accent': meta.color } }, chrome, body);
  return { el, meta, chrome, body };
}

/* ── canvas window preview ─────────────────────────────────────── */
export function previewFor(appId) {
  const meta = appMeta(appId);
  switch (meta.kind) {
    case 'gallery':
      return h('div', { class: 'grid2' }, ...Array.from({ length: 4 }, (_, i) => h('i', { style: { background: gradient(i + 2), opacity: '.75' } })));
    case 'music':
      return h('div', {}, h('div', { style: { height: '74px', borderRadius: '12px', background: 'linear-gradient(150deg, var(--nv-accent), var(--nv-accent-2))', marginBottom: '8px' } }),
        h('div', { class: 'line', style: { width: '70%' } }), h('div', { class: 'line', style: { width: '45%' } }));
    case 'video':
      return h('div', {}, h('div', { style: { height: '74px', borderRadius: '12px', background: gradient(8), marginBottom: '8px', display: 'grid', placeItems: 'center' } },
        h('span', { class: 'vid__play', html: icon('play', 'ico ico--sm') })),
        h('div', { class: 'line', style: { width: '58%' } }));
    case 'maps':
      return h('div', { style: { flex: '1', borderRadius: '12px', background: 'repeating-linear-gradient(115deg, color-mix(in srgb, var(--nv-text) 7%, transparent) 0 16px, transparent 16px 32px), var(--nv-bg-2)' } });
    case 'weather':
      return h('div', {}, h('div', { style: { height: '44px', borderRadius: '12px', background: 'linear-gradient(150deg, #22d3ee55, #2563eb44)', marginBottom: '8px' } }),
        h('div', { class: 'line', style: { width: '52%' } }), h('div', { class: 'line', style: { width: '74%' } }));
    case 'settings':
      return h('div', {}, ...[72, 58, 80].map((w, i) => h('div', { class: 'line', style: { width: `${w}%`, marginBottom: '7px' }, key: i })),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } },
          ...[0, 1, 2].map((i) => h('i', { style: { width: '34px', height: '22px', borderRadius: '8px', background: gradient(i + 10) } }))));
    default:
      return h('div', {}, ...[86, 62, 74, 48].map((w) => h('div', { class: 'line', style: { width: `${w}%` } })));
  }
}
