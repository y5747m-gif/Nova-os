/* ══════════════════════════════════════════════════════════════
   NOVA WALLPAPER — the Dynamic Space background engine
   Every wallpaper is a living scene, painted with CSS tokens
   (`--nv-wall-*`) plus the drifting blobs. The choice persists
   on the device (localStorage) and, inside the APK, syncs with
   the real system wallpaper (system / dim) through the bridge.
   ══════════════════════════════════════════════════════════════ */

import { isNativeShell, isNativeLauncher, setWallpaperMode as bridgeSetMode, wallpaperMode as bridgeMode } from './launcher.js';

const KEY = 'nova.wallpaper.v1';
const KEY_IMG = 'nova.wallpaper.img.v1';

/* id → label / note / picker swatch. `native` needs the real phone. */
export const WALLPAPERS = {
  aurora:   { label: 'أورورا',   note: 'سديم NOVA الحي',        swatch: 'linear-gradient(145deg, #6c5ce7, #22d3ee 55%, #0b0d13)' },
  sunset:   { label: 'غروب',     note: 'أزرق الليل ووهج المساء', swatch: 'linear-gradient(145deg, #ff9a5a, #ff5c8a 55%, #2a1230)' },
  ocean:    { label: 'محيط',    note: 'أعماق زرقاء هادئة',      swatch: 'linear-gradient(145deg, #22d3ee, #2563eb 55%, #06213a)' },
  forest:   { label: 'غابة',     note: 'أوراق خضراء في الضباب',   swatch: 'linear-gradient(145deg, #4ade80, #14532d 60%, #07130c)' },
  desert:   { label: 'صحراء',   note: 'رمال ذهبية وقت الغروب',   swatch: 'linear-gradient(145deg, #f5a524, #b45309 55%, #2b1608)' },
  midnight: { label: 'منتصف الليل', note: 'هدوء عميق قرب الأسود', swatch: 'linear-gradient(145deg, #1e293b, #0f172a 55%, #05060a)' },
  neon:     { label: 'نيون',     note: 'وهج مدينة كهربائي',       swatch: 'linear-gradient(145deg, #ff3d81, #00e5ff 55%, #12041f)' },
  rose:     { label: 'وردي',     note: 'ضوء وردي ناعم',          swatch: 'linear-gradient(145deg, #ff6b9a, #f9a8d4 55%, #3b0d24)' },
  mono:     { label: 'رمادي',    note: 'تدرّج راكد بلا لون',      swatch: 'linear-gradient(145deg, #9ca3af, #4b5563 55%, #0b0d13)' },
  custom:   { label: 'صورتي',    note: 'صورة من جهازك',          swatch: 'linear-gradient(145deg, #a78bfa, #34d399 55%, #0b0d13)' },
  system:   { label: 'النظام',   note: 'خلفية هاتفك الحقيقية',    swatch: 'linear-gradient(145deg, #334155, #0f172a)', native: true },
  dim:      { label: 'معتمة',    note: 'خلفية هاتفك بتعتيم',      swatch: 'linear-gradient(145deg, #1f2937, #05060a)', native: true },
};

let current = null;
const listeners = new Set();
const canUseStorage = () => { try { return typeof localStorage !== 'undefined'; } catch { return false; } }

function read(key) {
  try { return canUseStorage() ? localStorage.getItem(key) : null; } catch { return null; }
}
function write(key, value) {
  try {
    if (!canUseStorage()) return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode / quota — the choice just won't persist */ }
}

function validId(id) {
  return id && Object.prototype.hasOwnProperty.call(WALLPAPERS, id) ? id : 'aurora';
}

/** The scene currently on the Dynamic Space. */
export function wallpaperId() { return validId(current || 'aurora'); }

export function onWallpaperChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** The user's own image (data URL), if «صورتي» is chosen. */
export function customImage() { return read(KEY_IMG) || ''; }

/**
 * Apply + persist a wallpaper.
 *  · web scenes (aurora … mono / custom) are painted by the CSS tokens
 *  · system / dim need the phone's real wallpaper → the Android bridge
 */
export function setWallpaper(id, opts = {}) {
  const next = validId(id);
  const native = isNativeLauncher();

  // «صورتي» without an image falls back to picking one first
  if (next === 'custom' && !customImage() && !opts.silent) {
    openImagePicker((ok) => { if (ok) setWallpaper('custom', { silent: true }); });
    return;
  }
  // system scenes only exist on a real phone
  if ((next === 'system' || next === 'dim') && !native) {
    current = 'aurora';
  } else {
    current = next;
  }
  write(KEY, current);

  // CSS: 'dim' shares the system painting (the shell dims it natively)
  const cssMode = current === 'dim' ? 'system' : current;
  document.body.dataset.wallpaper = cssMode;

  const img = customImage();
  if (img) document.documentElement.style.setProperty('--nv-wall-img', `url(${img})`);
  else document.documentElement.style.removeProperty('--nv-wall-img');

  // keep the Android shell in sync: system scenes hand the wallpaper
  // to the phone; web scenes tell the shell to stand down
  if (isNativeLauncher()) {
    try { bridgeSetMode(current === 'system' || current === 'dim' ? current : 'web'); } catch { /* ignore */ }
  }

  for (const fn of listeners) fn(current);
  if (!opts.silent && opts.toast) opts.toast(`الخلفية: ${WALLPAPERS[current].label}`);
}

/**
 * Pick an image from the device and keep it (compressed) as the
 * «صورتي» wallpaper. Works in the browser, the PWA and the APK.
 */
export function openImagePicker(done) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.append(input);
  let finished = false;
  const finish = (ok) => {
    if (finished) return;
    finished = true;
    input.remove();
    done?.(ok);
  };
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) { finish(false); return; }
    const reader = new FileReader();
    reader.onerror = () => finish(false);
    reader.onload = () => {
      try {
        compressImage(String(reader.result), (dataUrl) => {
          if (!dataUrl) { finish(false); return; }
          write(KEY_IMG, dataUrl);
          finish(true);
        });
      } catch { finish(false); }
    };
    reader.readAsDataURL(file);
  });
  // if the user cancels, the input simply goes away on the next tap
  input.addEventListener('cancel', () => finish(false));
  input.click();
  setTimeout(() => { if (!finished && !input.files?.length) finish(false); }, 120000);
}

function compressImage(dataUrl, out) {
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { out(dataUrl); return; }
        ctx.drawImage(img, 0, 0, w, h);
        out(canvas.toDataURL('image/jpeg', 0.82));
      } catch { out(dataUrl); }
    };
    img.onerror = () => out('');
    img.src = dataUrl;
  } catch { out(''); }
}

export function clearCustomImage() {
  write(KEY_IMG, null);
  document.documentElement.style.removeProperty('--nv-wall-img');
}

/**
 * Boot-time restore. Inside the APK the shell may already force the
 * system wallpaper (system / dim) — that choice wins; otherwise the
 * saved scene comes back instantly.
 */
export function initWallpaper() {
  let id = read(KEY) || '';
  if (isNativeLauncher()) {
    try {
      const shellMode = bridgeMode();
      if (shellMode === 'system' || shellMode === 'dim') id = shellMode;
      else if (!id) id = 'aurora';
    } catch { /* ignore */ }
  }
  if (!id) id = 'aurora';
  setWallpaper(id, { silent: true });
  return current;
}
