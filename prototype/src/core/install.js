/* ══════════════════════════════════════════════════════════════
   NOVA INSTALL — "put NOVA on my phone"
   Two real paths (docs/06-install.md):
     1. Install as an app right now (installable web app / PWA)
     2. Download the Android APK (built from this repo by CI)
   ══════════════════════════════════════════════════════════════ */

import { h } from './dom.js';
import { icon } from './icons.js';
import { NOVA_VERSION } from './version.js';

export const REPO = 'y5747m-gif/Nova-os';
export const WORKFLOW_URL = `https://github.com/${REPO}/actions/workflows/apk.yml`;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const BUILD_DOC_URL = `https://github.com/${REPO}/blob/main/docs/06-install.md`;

/* ── platform facts ────────────────────────────────────────────── */
/** True when NOVA runs inside the Android APK (MainActivity's JS bridge). */
export function isNativeShell() { return typeof window.NovaSystem?.download === 'function'; }

export function isStandalone() {
  return (window.matchMedia?.('(display-mode: standalone)').matches ?? false)
    || (window.matchMedia?.('(display-mode: fullscreen)').matches ?? false)
    || navigator.standalone === true;
}
export function isAndroid() { return /Android/i.test(navigator.userAgent); }
export function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream; }
export function canInstallPrompt() { return !!deferredPrompt; }

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  window.dispatchEvent(new CustomEvent('nova:installable'));
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  window.dispatchEvent(new CustomEvent('nova:installed'));
});

/* ── the GitHub release that carries the APK ───────────────────── */
export async function latestApk({ timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const releases = await res.json();
    for (const release of releases) {
      const asset = (release.assets || []).find((a) => a.name?.endsWith('.apk'));
      if (asset) {
        return {
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size,
          version: (asset.name.match(/v?\d+\.\d+\.\d+/) || [])[0] || release.tag_name,
          published: release.published_at,
          tag: release.tag_name,
        };
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── service worker ───────────────────────────────────────────── */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (location.protocol === 'file:') return null;
  // inside the APK the assets are served by WebViewAssetLoader: no SW needed
  if (document.body.dataset.shell === 'app' && location.hostname.endsWith('nova.local')) return null;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('nova:update-ready', { detail: { registration: reg } }));
        }
      });
    });
    return reg;
  } catch (err) {
    console.warn('[nova] service worker unavailable:', err.message);
    return null;
  }
}

export async function checkForUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (!reg) return false;
  await reg.update().catch(() => {});
  return !!reg.waiting || !!reg.installing;
}

export function applyUpdate() {
  navigator.serviceWorker?.getRegistration?.().then((reg) => {
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 220);
  });
}

/* ══════════════════════════════════════════════════════════════
   The sheet
   ══════════════════════════════════════════════════════════════ */
export function createInstaller({ layer, toast, emit }) {
  let el = null;
  let apkInfo = null;
  const status = h('p', { class: 'install__status' }, '');

  function setStatus(text, tone = '') {
    status.textContent = text || '';
    status.dataset.tone = tone;
  }

  function close() {
    el?.remove();
    el = null;
  }

  function open() {
    if (el) return close();
    setStatus('');
    el = h('div', { class: 'install-scrim', dataset: { nodrag: '1' } });
    el.addEventListener('click', (e) => { if (e.target === el) close(); });

    const sheet = h('div', { class: 'install-sheet' },
      h('div', { class: 'install__head' },
        h('span', { class: 'install__mark', html: icon('apps', 'ico') }),
        h('div', {},
          h('b', {}, 'ثبّت NOVA OS على هاتفك'),
          h('small', {}, isStandalone() ? `مثبّت الآن · v${NOVA_VERSION}` : `إصدار v${NOVA_VERSION} · A New Way to Use Your Phone`),
        ),
        h('button', { class: 'install__x', html: icon('close', 'ico ico--sm'), onclick: close }),
      ),

      /* ── path 1: installable app, works immediately ─────────── */
      h('section', { class: 'install__card' },
        h('div', { class: 'install__cardHead' },
          h('span', { class: 'install__badge install__badge--now' }, 'فوري'),
          h('b', {}, 'تطبيق على الشاشة الرئيسية'),
          h('small', {}, isNativeShell()
            ? 'إنت جوّه تطبيق NOVA الأصلي بالفعل — الطريق ده للمتصفح فقط.'
            : 'يشتغل ملء الشاشة، بدون شريط المتصفح — ويفتح أوفلاين بعد أول مرة.'),
        ),
        h('div', { class: 'install__acts' },
          h('button', {
            class: 'install__btn install__btn--primary',
            id: 'install-pwa',
            onclick: async () => {
              if (isStandalone()) { setStatus('NOVA مثبّت بالفعل على الجهاز ده ✓', 'ok'); return; }
              if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                if (outcome === 'accepted') { setStatus('تم التثبيت ✓ — افتح NOVA من الشاشة الرئيسية', 'ok'); emit?.('success'); }
                else setStatus('تم إلغاء التثبيت — تقدر تجرب تاني في أي وقت');
              } else {
                showManualInstall();
              }
            },
          }, isStandalone() ? 'مثبّت ✓' : 'ثبّت الآن'),
          h('button', { class: 'install__btn', onclick: showManualInstall }, 'طريقة التثبيت'),
        ),
        h('div', { class: 'install__manual hidden', id: 'install-manual' },
          isIOS()
            ? h('p', {}, 'على iPhone لازم تفتح الرابط من ', h('b', {}, 'Safari'), ': اضغط زر المشاركة ', h('b', {}, '⬆'), ' ثم ', h('b', {}, 'إضافة إلى الشاشة الرئيسية'), '.')
            : h('p', {}, 'من قائمة المتصفح ', h('b', {}, '⋮'), ' اختر ', h('b', {}, 'إضافة إلى الشاشة الرئيسية / تثبيت التطبيق'), '.'),
        ),
      ),

      /* ── path 2: the real APK ───────────────────────────────── */
      h('section', { class: 'install__card' },
        h('div', { class: 'install__cardHead' },
          h('span', { class: 'install__badge' }, 'APK'),
          h('b', {}, 'تحميل كتطبيق Android (.apk)'),
          h('small', {}, 'قشرة نظام أصلية: WebView كامل الشاشة، أيقونة مشغّل (launcher)، وبدون شريط عناوين.'),
        ),
        h('div', { class: 'install__acts' },
          h('button', {
            class: 'install__btn install__btn--primary',
            id: 'install-apk',
            onclick: downloadApk,
          }, 'تحميل APK'),
          h('a', { class: 'install__btn', href: WORKFLOW_URL, target: '_blank', rel: 'noopener' }, 'صفحة البناء'),
        ),
        status,
        h('div', { class: 'install__steps', id: 'install-apk-steps' }),
      ),

      h('footer', { class: 'install__foot' },
        h('p', {}, 'الـAPK بيتشيّد من نفس الكود ده على GitHub Actions (بدون أي مفاتيح أو خدمات خارجية). ',
          h('a', { href: BUILD_DOC_URL, target: '_blank', rel: 'noopener' }, 'خطوات البناء والحقن اليدوي ←')),
        h('p', { class: 'install__warn' }, 'عند التثبيت: هتحتاج تسمح بـ«تثبيت تطبيقات من مصادر غير معروفة» للتطبيق اللي بتحمّل منه (المتصفح/مدير الملفات).'),
        h('p', { class: 'install__warn' }, 'لو ظهر «تعارض في التطبيق» أثناء التحديث: امسح النسخة القديمة الأول — النسخ المبنية تلقائيًا ليها توقيع تجريبي مختلف كل مرة، ودليل التثبيت يشرح تفعيل توقيع ثابت.'),
      ),
    );

    el.append(sheet);
    layer.append(el);
    checkApk();
  }

  function showManualInstall() {
    el?.querySelector('#install-manual')?.classList.remove('hidden');
  }

  function showApkSteps(extra = '') {
    const steps = el?.querySelector('#install-apk-steps');
    if (!steps) return;
    steps.innerHTML = '';
    steps.append(
      h('p', {}, extra),
      h('ol', {},
        h('li', {}, `افتح صفحة البناء على GitHub: `, h('a', { href: WORKFLOW_URL, target: '_blank', rel: 'noopener' }, 'Build NOVA OS APK')),
        h('li', {}, 'اضغط ', h('b', {}, 'Run workflow'), ' على الفرع ', h('b', {}, '«main»'), ' — البناء بياخد ~3 دقايق.'),
        h('li', {}, 'بعد ما يخلص، هيظهر ملف ', h('b', {}, '«ملف الـAPK»'), ' في صفحة ', h('b', {}, 'Releases'), ' — وده اللينك اللي الزر ده بيدوّر عليه أوتوماتيك.'),
        h('li', {}, 'افتح الـAPK على الأندرويد ← تثبيت ← ثم اجعله المشغّل الافتراضي (اختياري).'),
      ),
    );
  }

  async function checkApk() {
    setStatus('بندوّر على أحدث نسخة APK…');
    try {
      apkInfo = await latestApk();
    } catch {
      apkInfo = null;
    }
    if (apkInfo) {
      const mb = (apkInfo.size / (1024 * 1024)).toFixed(2);
      setStatus(`جاهز: ${apkInfo.name} · ${mb} م.ب`, 'ok');
      el?.querySelector('#install-apk-steps')?.replaceChildren(h('p', { class: 'install__ok' }, 'اضغط «تحميل APK» — الملف بيتنزّل مباشرة من صفحة الإصدارات الموثّقة على GitHub.'));
    } else {
      setStatus('مفيش نسخة مبنية لسه — شغّل البناء مرة واحدة وتبقى جاهزة للجميع.', 'warn');
      showApkSteps('البناء لسه ما اشتغلش على المستودع (أو الـAPI مش متاح). مرة واحدة بس:');
    }
  }

  async function downloadApk() {
    if (!apkInfo) {
      await checkApk();
      if (!apkInfo) { emit?.('error'); toast?.('لسه مفيش APK مبني — شغّل الـworkflow مرة واحدة'); return; }
    }
    setStatus(`بينزّل ${apkInfo.name}…`);
    if (typeof window.NovaSystem?.download === 'function') {
      // inside the APK: download to the app cache and open the system installer
      window.NovaSystem.download(apkInfo.url, apkInfo.name);
      emit?.('success');
      return;
    }
    const a = document.createElement('a');
    a.href = apkInfo.url;
    a.rel = 'noopener';
    a.download = apkInfo.name;
    document.body.append(a);
    a.click();
    a.remove();
    emit?.('success');
    setTimeout(() => setStatus('افتح الملف بعد ما ينزل ← تثبيت. بعد كده هتلاقي NOVA في قائمة التطبيقات.', 'ok'), 900);
  }

  return {
    open,
    close,
    get isOpen() { return !!el; },
    get apk() { return apkInfo; },
    refresh: checkApk,
  };
}
