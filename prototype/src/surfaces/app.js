/* ══════════════════════════════════════════════════════════════
   App surfaces — one instance, four shapes (docs/01 §4)
   The same content renderer is used by the full surface, the
   split panes and the NOVA CANVAS window previews.
   ══════════════════════════════════════════════════════════════ */

import { h, gradient } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appMeta } from '../core/store.js';

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
    case 'notes': return notesContent();
    case 'browser': return browserContent();
    case 'maps': return mapsContent();
    case 'privacy': return privacyContent();
    default: return h('div', { class: 'simple' }, h('h3', {}, meta.name));
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
    html: icon('play', 'ico'),
    onclick: () => {
      playing.v = !playing.v;
      play.innerHTML = playing.v ? icon('play', 'ico') : icon('pluss', 'ico');
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

function notesContent() {
  return h('div', { class: 'simple' },
    h('h3', {}, 'خطة الأسبوع'),
    h('p', {}, '• إنهاء بروتوتايب NOVA MOTION\n• مراجعة منحنى الـspring مع الفريق\n• تجربة الإيماءات على جهاز حقيقي'),
    h('div', { class: 'line', style: { width: '82%' } }),
    h('div', { class: 'line', style: { width: '64%' } }),
    h('div', { class: 'line', style: { width: '74%' } }),
  );
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

  const chrome = h('div', { class: 'app__chrome' },
    h('span', { style: { color: meta.color }, html: icon(meta.icon, 'ico') }),
    h('span', { class: 't' }, h('b', {}, meta.title || meta.name), h('span', {}, meta.titleSub || meta.sub)),
    collapse,
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
    case 'maps':
      return h('div', { style: { flex: '1', borderRadius: '12px', background: 'repeating-linear-gradient(115deg, color-mix(in srgb, var(--nv-text) 7%, transparent) 0 16px, transparent 16px 32px), var(--nv-bg-2)' } });
    default:
      return h('div', {}, ...[86, 62, 74, 48].map((w) => h('div', { class: 'line', style: { width: `${w}%` } })));
  }
}
