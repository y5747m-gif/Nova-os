/* ══════════════════════════════════════════════════════════════
   NOVA LAUNCHER ADAPTER — the web side of the NovaSystem bridge
   In the APK this talks to real Android (installed apps, icons,
   shortcuts, live notifications, usage, contacts, widgets). In a
   browser every call degrades gracefully to the demo catalogue.
   ══════════════════════════════════════════════════════════════ */

function bridge() {
  try {
    return typeof window !== 'undefined' ? window.NovaSystem : undefined;
  } catch {
    return undefined;
  }
}

/** True only when the full launcher shell is present (not a stub). */
export function isNativeLauncher() {
  const b = bridge();
  return !!b && typeof b.listApps === 'function' && typeof b.launchApp === 'function';
}

export function isNativeShell() {
  const b = bridge();
  return !!b && (typeof b.download === 'function' || isNativeLauncher());
}

function safeJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/* ── installed apps ──────────────────────────────────────────── */
let appCache = null;
let appCacheAt = 0;
const APP_TTL = 20000;

export function realApps(force = false) {
  if (!isNativeLauncher()) return [];
  const now = Date.now();
  if (!force && appCache && now - appCacheAt < APP_TTL) return appCache;
  try {
    const list = safeJson(bridge().listApps(), []);
    appCache = Array.isArray(list) ? list : [];
    appCacheAt = now;
    return appCache;
  } catch {
    return appCache || [];
  }
}

export function refreshRealApps() {
  appCache = null;
  iconCache.clear();
  if (!isNativeLauncher()) return [];
  try {
    const list = typeof bridge().refreshApps === 'function'
      ? safeJson(bridge().refreshApps(), [])
      : safeJson(bridge().listApps(), []);
    appCache = Array.isArray(list) ? list : [];
    appCacheAt = Date.now();
    return appCache;
  } catch {
    return [];
  }
}

const iconCache = new Map();
export function realAppIcon(pkg) {
  if (!pkg) return '';
  if (iconCache.has(pkg)) return iconCache.get(pkg);
  let uri = '';
  try {
    if (isNativeLauncher() && typeof bridge().appIcon === 'function') {
      uri = bridge().appIcon(pkg) || '';
    }
  } catch { uri = ''; }
  if (iconCache.size > 260) iconCache.clear();
  iconCache.set(pkg, uri);
  return uri;
}

/**
 * Fill the icon cache for a whole screenful of apps in ONE bridge
 * crossing (NovaSystem.iconsFor) — a drawer of 200 apps paints in
 * waves instead of blocking the JS thread tile by tile. Browsers
 * without the batch method fall back to per-app calls.
 */
export function realIconsBatch(pkgs) {
  const need = (pkgs || []).filter((p) => p && !iconCache.has(p));
  if (!need.length) return;
  try {
    if (isNativeLauncher() && typeof bridge().iconsFor === 'function') {
      const map = safeJson(bridge().iconsFor(JSON.stringify(need.slice(0, 36))), {});
      for (const [k, v] of Object.entries(map || {})) {
        if (iconCache.size > 600) iconCache.clear();
        iconCache.set(k, v || '');
      }
      return;
    }
    for (const p of need.slice(0, 12)) realAppIcon(p);
  } catch { /* icons stay fallback letters */ }
}

export function launchRealApp(pkg) {
  try {
    return isNativeLauncher() ? !!bridge().launchApp(pkg) : false;
  } catch {
    return false;
  }
}

export function openRealAppInfo(pkg) {
  try { bridge()?.openAppInfo?.(pkg); } catch { /* ignore */ }
}

export function uninstallRealApp(pkg) {
  try { bridge()?.uninstallApp?.(pkg); } catch { /* ignore */ }
}

export function realShortcuts(pkg) {
  try {
    if (!isNativeLauncher() || typeof bridge().appShortcuts !== 'function') return [];
    const list = safeJson(bridge().appShortcuts(pkg), []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function launchRealShortcut(pkg, id) {
  try {
    return isNativeLauncher() ? !!bridge().launchShortcut(pkg, id) : false;
  } catch {
    return false;
  }
}

/* ── default launcher / setup ────────────────────────────────── */
export function launcherState() {
  try {
    if (typeof window !== 'undefined' && window.NovaLauncherState) return window.NovaLauncherState;
  } catch { /* ignore */ }
  if (!isNativeLauncher()) return { def: false, notif: false, usage: false, setup: true };
  try {
    const b = bridge();
    return {
      def: !!b.isDefaultLauncher?.(),
      notif: !!b.hasNotificationAccess?.(),
      usage: !!b.hasUsageAccess?.(),
      setup: !!b.setupDone?.(),
    };
  } catch {
    return { def: false, notif: false, usage: false, setup: false };
  }
}

export function requestDefaultLauncher() {
  try { bridge()?.requestDefaultLauncher?.(); } catch { /* ignore */ }
}

export function openHomeSettings() {
  try { bridge()?.openHomeSettings?.(); } catch { /* ignore */ }
}

export function markSetupDone() {
  try { bridge()?.setSetupDone?.(true); } catch { /* ignore */ }
}

export function askPermission(permission) {
  try { bridge()?.askPermission?.(permission); } catch { /* ignore */ }
}

/* ── intelligence ────────────────────────────────────────────── */
export function topRealApps(limit = 12) {
  try {
    if (!isNativeLauncher() || typeof bridge().topApps !== 'function') return [];
    const list = safeJson(bridge().topApps(limit), []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function searchRealContacts(q) {
  try {
    if (!isNativeLauncher() || typeof bridge().searchContacts !== 'function') return [];
    const list = safeJson(bridge().searchContacts(q || ''), []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function dialNumber(number) {
  try { return !!bridge()?.dial?.(number); } catch { return false; }
}

/* ── flow (live notifications) ───────────────────────────────── */
export function liveNotifications() {
  try {
    if (!isNativeLauncher() || typeof bridge().liveNotifications !== 'function') return [];
    const list = safeJson(bridge().liveNotifications(), []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function openNotification(key) {
  try { return !!bridge()?.openNotification?.(key); } catch { return false; }
}

export function dismissNotification(key) {
  try { bridge()?.dismissNotification?.(key); } catch { /* ignore */ }
}

export function openNotificationAccess() {
  try { bridge()?.openNotificationAccess?.(); } catch { /* ignore */ }
}

export function openUsageSettings() {
  try { bridge()?.openUsageSettings?.(); } catch { /* ignore */ }
}

/* ── widgets / system ────────────────────────────────────────── */
export function openWidgets() {
  try { bridge()?.openWidgets?.(); } catch { /* ignore */ }
}

export function placedWidgets() {
  try {
    if (!isNativeLauncher() || typeof bridge().placedWidgets !== 'function') return [];
    const list = safeJson(bridge().placedWidgets(), []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function wallpaperMode() {
  try {
    if (!isNativeLauncher() || typeof bridge().wallpaperMode !== 'function') return 'aurora';
    return bridge().wallpaperMode() || 'aurora';
  } catch {
    return 'aurora';
  }
}

export function setWallpaperMode(mode) {
  try { bridge()?.setWallpaperMode?.(mode); } catch { /* ignore */ }
}

export function nativeHaptic(kind) {
  try { bridge()?.haptic?.(kind || 'tick'); } catch { /* ignore */ }
}

/* label lookup for a package (falls back to the package name) */
export function realAppLabel(pkg) {
  const found = realApps().find((a) => a.p === pkg);
  return found ? found.l : pkg;
}
