/* ══════════════════════════════════════════════════════════════
   NOVA SETUP — the first-run wizard (native shell only)
   Turns NOVA from "an app" into "the phone": default launcher, live
   notifications, intelligence and wallpaper — each step explains why,
   deep-links to the exact system screen, and celebrates the grant.
   ══════════════════════════════════════════════════════════════ */

import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import NovaMotion, { clamp } from '../motion/motion.js';
import {
  launcherState, requestDefaultLauncher, openHomeSettings, openNotificationAccess,
  openUsageSettings, askPermission, setWallpaperMode, wallpaperMode, markSetupDone,
  isNativeLauncher,
} from '../core/launcher.js';

const STEPS = ['welcome', 'home', 'notif', 'smart', 'walls', 'done'];

export function mountSetup(layer, ctx = {}) {
  let stepIx = 0;
  let opened = false;
  let status = { def: false, notif: false, usage: false, setup: false };

  const dots = h('div', { class: 'setup__dots' });
  const body = h('div', { class: 'setup__body' });
  const foot = h('div', { class: 'setup__foot' });
  const el = h('div', { class: 'setup hidden' },
    h('div', { class: 'setup__card' },
      h('div', { class: 'setup__glow' }),
      dots,
      body,
      foot,
    ),
  );
  layer.append(el);

  function refresh() {
    status = launcherState();
    paintDots();
    if (opened) paintStep(true);
  }

  function paintDots() {
    dots.replaceChildren(...STEPS.map((s, i) => h('i', {
      class: i === stepIx ? 'setup__dot setup__dot--on' : (i < stepIx ? 'setup__dot setup__dot--done' : 'setup__dot'),
    })));
  }

  function row(ico, color, title, sub, action) {
    return h('div', { class: 'setup__row' },
      h('span', { class: 'setup__ico', style: { color }, html: icon(ico, 'ico') }),
      h('span', { class: 'setup__meta' }, h('b', {}, title), h('span', {}, sub)),
      action || h('span'),
    );
  }

  function cta(label, fn, primary = true, ghost = false) {
    return h('button', {
      class: primary ? 'setup__cta' : (ghost ? 'setup__ghost' : 'setup__secondary'),
      onclick: (e) => { e.stopPropagation(); ctx.emit?.('tick'); fn?.(); },
    }, label);
  }

  function badge(ok) {
    return h('span', { class: ok ? 'setup__badge setup__badge--on' : 'setup__badge' }, ok ? '✓ مفعّل' : 'مطلوب');
  }

  function paintStep(instant = false) {
    const step = STEPS[stepIx];
    paintDots();
    clear(body);
    clear(foot);

    if (step === 'welcome') {
      body.append(
        h('div', { class: 'setup__logo' }, h('span', {}, '◉')),
        h('h2', { class: 'setup__title' }, 'أهلاً بك في NOVA'),
        h('p', { class: 'setup__sub' }, 'طريقة جديدة لاستخدام هاتفك — لنحوّل NOVA إلى واجهة هاتفك الأساسية في أقل من دقيقة.'),
        h('div', { class: 'setup__list' },
          row('layers', '#6c5ce7', 'لانشر كامل', 'شاشتك الرئيسية الجديدة بكل تطبيقاتك'),
          row('actions', '#22d3ee', 'إشعارات هادئة', 'NOVA FLOW يجمعها كبطاقات بدل المقاطعة'),
          row('search', '#4ade80', 'ذكاء يفهمك', 'اقتراحات حسب وقتك واستخدامك'),
        ),
      );
      foot.append(cta('ابدأ الإعداد', () => go(1)), cta('لاحقًا', () => finish(false), false, true));
    }

    if (step === 'home') {
      body.append(
        h('h2', { class: 'setup__title' }, 'اجعله بيتك'),
        h('p', { class: 'setup__sub' }, 'عيّن NOVA كتطبيق الشاشة الرئيسية الافتراضي — زر الهوم سيفتح NOVA دائمًا.'),
        row('layers', '#6c5ce7', 'اللانشر الافتراضي', status.def ? 'NOVA هو بيتك الآن' : 'اضغط واختر NOVA من القائمة', badge(status.def)),
      );
      foot.append(
        status.def ? cta('التالي', () => go(2)) : cta('تعيين كافتراضي', () => requestDefaultLauncher()),
        cta('إعدادات النظام', () => openHomeSettings(), false),
      );
    }

    if (step === 'notif') {
      body.append(
        h('h2', { class: 'setup__title' }, 'إشعارات بلا مقاطعة'),
        h('p', { class: 'setup__sub' }, 'يقرأ NOVA FLOW إشعاراتك ليعرضها كبطاقات هادئة — لا شيء يطفو فوق ما تفعله.'),
        row('actions', '#22d3ee', 'إذن الإشعارات', 'لتنبيهات NOVA نفسه', null),
        row('shield', '#4ade80', 'وصول الإشعارات', status.notif ? 'يقرأ NOVA الأحداث الحية' : 'اختر NOVA وفعّل السماح', badge(status.notif)),
      );
      foot.append(
        cta(status.notif ? 'التالي' : 'منح الوصول', () => {
          if (status.notif) { go(3); return; }
          askPermission('android.permission.POST_NOTIFICATIONS');
          openNotificationAccess();
          setTimeout(() => refresh(), 800);
        }),
        cta('تخطي', () => go(3), false, true),
      );
    }

    if (step === 'smart') {
      body.append(
        h('h2', { class: 'setup__title' }, 'ذكاء يحترم خصوصيتك'),
        h('p', { class: 'setup__sub' }, 'كل التحليل على جهازك — لا شيء يغادر الهاتف أبدًا. فعّل الاقتراحات الذكية وجهات الاتصال.'),
        row('search', '#4ade80', 'التطبيقات المقترحة', status.usage ? 'NOVA يتعلّم عاداتك' : 'يعتمد على استخدام التطبيقات', badge(status.usage)),
        row('people', '#f5a524', 'جهات الاتصال', 'للبحث عن الأشخاص والاتصال السريع', null),
      );
      foot.append(
        h('div', { class: 'setup__btnrow' },
          status.usage ? cta('التالي', () => go(4)) : cta('تفعيل الذكاء', () => { openUsageSettings(); setTimeout(() => refresh(), 800); }),
          cta('جهات الاتصال', () => askPermission('android.permission.READ_CONTACTS'), false),
        ),
        cta('تخطي', () => go(4), false, true),
      );
    }

    if (step === 'walls') {
      const cur = wallpaperMode();
      const opt = (id, label, sub2) => h('button', {
        class: id === cur ? 'setup__wall setup__wall--on' : 'setup__wall',
        onclick: () => { setWallpaperMode(id); ctx.emit?.('tick'); paintStep(true); },
      }, h('b', {}, label), h('span', {}, sub2));
      body.append(
        h('h2', { class: 'setup__title' }, 'خلفية المساحة'),
        h('p', { class: 'setup__sub' }, 'اختر روح شاشتك — يمكنك تغييرها في أي وقت.'),
        h('div', { class: 'setup__walls' },
          opt('aurora', 'أورورا', 'سديم NOVA الحي'),
          opt('system', 'النظام', 'خلفية هاتفك'),
          opt('dim', 'معتمة', 'خلفية هاتفك بتعتيم'),
        ),
      );
      foot.append(cta('التالي', () => go(5)));
    }

    if (step === 'done') {
      body.append(
        h('div', { class: 'setup__logo setup__logo--done' }, h('span', {}, '✓')),
        h('h2', { class: 'setup__title' }, 'كل شيء جاهز'),
        h('p', { class: 'setup__sub' }, status.def
          ? 'NOVA هو الآن واجهة هاتفك. اسحب من الأسفل لـ CORE، ومن الأعلى لـ FLOW.'
          : 'يمكنك تعيين NOVA كافتراضي في أي وقت من الإعدادات.'),
      );
      foot.append(cta('ادخل إلى NOVA', () => finish(true)));
    }

    // entrance: the step content rises in one cascade
    const kids = Array.from(body.children);
    kids.forEach((k) => { k.style.opacity = '0'; });
    const run = () => {
      const c = NovaMotion.cascade({
        items: kids,
        stagger: 46,
        span: 460,
        springName: 'SOFT',
        onUpdate: (node, _i, p) => {
          node.style.opacity = String(clamp(p * 1.4));
          node.style.transform = `translate3d(0, ${((1 - p) * 26).toFixed(1)}px, 0)`;
        },
      });
      c.release('commit', 700);
    };
    if (instant) run();
    else {
      NovaMotion.spring({
        from: 0, to: 1, springName: 'SNAP',
        onUpdate: () => {},
        onDone: run,
      });
    }
  }

  function go(ix) {
    stepIx = Math.max(0, Math.min(STEPS.length - 1, ix));
    ctx.emit?.('open');
    // slide the card, then repaint
    const card = el.querySelector('.setup__card');
    NovaMotion.spring({
      from: 0, to: 1, springName: 'SOFT',
      onUpdate: (v) => {
        const k = Math.sin(v * Math.PI);
        card.style.transform = `translate3d(${(k * -26).toFixed(1)}px, 0, 0)`;
        card.style.opacity = String(1 - k * 0.35);
      },
      onDone: () => {
        card.style.transform = '';
        card.style.opacity = '1';
        paintStep();
      },
    });
  }

  function open() {
    if (opened) return;
    opened = true;
    refresh();
    el.classList.remove('hidden');
    ctx.emit?.('open');
    const card = el.querySelector('.setup__card');
    const c = NovaMotion.cascade({
      items: [card],
      stagger: 0,
      span: 420,
      springName: 'SOFT',
      onUpdate: (node, _i, p) => {
        node.style.opacity = String(clamp(p * 1.3));
        node.style.transform = `translate3d(0, ${((1 - p) * 70).toFixed(1)}px, 0) scale(${(0.92 + 0.08 * p).toFixed(3)})`;
      },
    });
    c.release('commit', 800);
  }

  function close() {
    if (!opened) return;
    opened = false;
    el.classList.add('hidden');
    ctx.emit?.('close');
  }

  function finish(celebrate) {
    try { markSetupDone(); } catch { /* ignore */ }
    status.setup = true;
    if (celebrate) {
      ctx.burst?.();
      ctx.toast?.('أهلاً بك في NOVA — هاتفك بطريقة جديدة');
    }
    close();
  }

  function shouldAutoShow() {
    if (!isNativeLauncher()) return false;
    const s = launcherState();
    return !s.setup;
  }

  try {
    window.addEventListener('nova:launcher', () => { if (opened) refresh(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && opened) setTimeout(() => refresh(), 500);
    });
  } catch { /* ignore */ }

  return {
    el, open, close, refresh, shouldAutoShow,
    get isOpen() { return opened; },
    get step() { return STEPS[stepIx]; },
  };
}
