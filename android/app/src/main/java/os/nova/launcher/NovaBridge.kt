package os.nova.launcher

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlin.concurrent.thread

/**
 * NovaSystem — the JS bridge. The web layer calls it as `window.NovaSystem`.
 * Everything here is optional from NOVA's point of view: the same web build
 * runs in a plain browser with the methods missing.
 *
 * Launcher surface (all safe to call from any thread; every method catches):
 *   apps ......... catalogue, icons, launch, info, uninstall, shortcuts
 *   home ......... default-launcher status + one-tap request
 *   flow ......... live notification access + active snapshot
 *   intelligence . usage-ranked suggestions + contacts search
 *   canvas ....... system widgets sheet
 *   system ....... wallpaper, brightness, haptics, share, update
 */
class NovaBridge(
    private val activity: MainActivity,
    private val web: WebView,
) {
    private val ctx: Context get() = activity.applicationContext

    /* ── identity ─────────────────────────────────────────────── */
    @JavascriptInterface
    fun platform(): String = "android"

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun sdk(): Int = Build.VERSION.SDK_INT

    @JavascriptInterface
    fun shell(): String = "launcher"

    /* ── installed apps ───────────────────────────────────────── */
    @JavascriptInterface
    fun listApps(): String = guarded("") { NovaApps.catalogueJson(ctx) }

    @JavascriptInterface
    fun refreshApps(): String {
        NovaApps.invalidate()
        return listApps()
    }

    @JavascriptInterface
    fun appIcon(packageName: String): String =
        guarded("") { NovaApps.iconUri(ctx, packageName) }

    /** Batched icons for a whole drawer screen: JSON array in, `{pkg: dataUri}` out. */
    @JavascriptInterface
    fun iconsFor(packagesJson: String): String =
        guarded("{}") { NovaApps.iconsJson(ctx, packagesJson) }

    @JavascriptInterface
    fun launchApp(packageName: String): Boolean =
        guarded(false) { NovaApps.launch(ctx, packageName) }

    @JavascriptInterface
    fun openAppInfo(packageName: String): Boolean =
        guarded(false) { NovaApps.openInfo(ctx, packageName) }

    @JavascriptInterface
    fun uninstallApp(packageName: String): Boolean =
        guarded(false) { NovaApps.uninstall(ctx, packageName) }

    @JavascriptInterface
    fun appShortcuts(packageName: String): String =
        guarded("[]") { NovaApps.shortcutsJson(ctx, packageName) }

    @JavascriptInterface
    fun launchShortcut(packageName: String, shortcutId: String): Boolean =
        guarded(false) { NovaApps.launchShortcut(ctx, packageName, shortcutId) }

    /* ── default launcher (HOME role) ─────────────────────────── */
    @JavascriptInterface
    fun isLauncher(): Boolean = isDefaultLauncher()

    @JavascriptInterface
    fun isDefaultLauncher(): Boolean = guarded(false) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = ctx.getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                return@guarded rm.isRoleHeld(RoleManager.ROLE_HOME)
            }
        }
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolved = ctx.packageManager.resolveActivity(
            intent, PackageManager.MATCH_DEFAULT_ONLY
        )
        resolved?.activityInfo?.packageName == ctx.packageName
    }

    /** One-tap request: the system role dialog on Android 10+, else settings. */
    @JavascriptInterface
    fun requestDefaultLauncher() {
        activity.runOnUiThread { activity.requestHomeRole() }
    }

    @JavascriptInterface
    fun openHomeSettings() {
        activity.runOnUiThread { activity.openHomeSettings() }
    }

    /* ── NOVA FLOW — live notifications ───────────────────────── */
    @JavascriptInterface
    fun hasNotificationAccess(): Boolean =
        guarded(false) { NovaNotificationService.isEnabled(ctx) }

    @JavascriptInterface
    fun openNotificationAccess() {
        NovaNotificationService.openSettings(ctx)
    }

    @JavascriptInterface
    fun liveNotifications(): String =
        guarded("[]") { NovaNotificationService.snapshot(ctx) }

    @JavascriptInterface
    fun openNotification(key: String): Boolean =
        guarded(false) { NovaNotificationService.open(ctx, key) }

    @JavascriptInterface
    fun dismissNotification(key: String): Boolean =
        guarded(false) { NovaNotificationService.dismiss(key) }

    @JavascriptInterface
    fun notify(title: String, body: String) {
        NovaNotify.show(ctx, title, body)
    }

    /* ── NOVA INTELLIGENCE — suggestions + people ─────────────── */
    @JavascriptInterface
    fun hasUsageAccess(): Boolean =
        guarded(false) { NovaApps.hasUsageAccess(ctx) }

    @JavascriptInterface
    fun openUsageSettings() {
        NovaApps.openUsageSettings(ctx)
    }

    @JavascriptInterface
    fun topApps(limit: Int): String =
        guarded("[]") { NovaApps.topPackagesJson(ctx, limit.coerceIn(1, 40)) }

    @JavascriptInterface
    fun searchContacts(query: String): String =
        guarded("[]") { NovaApps.contactsJson(ctx, query) }

    @JavascriptInterface
    fun dial(number: String): Boolean =
        guarded(false) { NovaApps.dial(ctx, number) }

    @JavascriptInterface
    fun askPermission(permission: String) {
        activity.runOnUiThread { activity.askRuntimePermission(permission) }
    }

    /** Real runtime-permission check so the UI never fakes a grant. */
    @JavascriptInterface
    fun hasPermission(permission: String): Boolean = guarded(false) {
        ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

    /* ── widgets ──────────────────────────────────────────────── */
    @JavascriptInterface
    fun openWidgets() {
        try {
            activity.startActivity(Intent(ctx, NovaWidgetHostActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (_: Exception) { }
    }

    @JavascriptInterface
    fun placedWidgets(): String =
        guarded("[]") { NovaWidgets.placedJson(ctx) }

    /* ── system surfaces ──────────────────────────────────────── */
    @JavascriptInterface
    fun wallpaperMode(): String = guarded("aurora") { NovaPrefs.wallpaperMode(ctx) }

    @JavascriptInterface
    fun setWallpaperMode(mode: String) {
        // system | dim → the phone's real wallpaper behind NOVA;
        // anything else is a web-painted scene (aurora, sunset, …, custom)
        val safe = if (mode == "system" || mode == "dim") mode else "web"
        NovaPrefs.setWallpaperMode(ctx, safe)
        activity.runOnUiThread { activity.applyWallpaperMode() }
    }

    @JavascriptInterface
    fun pickWallpaper() {
        activity.runOnUiThread { activity.pickSystemWallpaper() }
    }

    @JavascriptInterface
    fun setBrightness(value: Double) {
        activity.runOnUiThread { activity.setWindowBrightness(value.toFloat()) }
    }

    @JavascriptInterface
    fun haptic(kind: String) {
        activity.runOnUiThread { activity.nativeHaptic(kind) }
    }

    @JavascriptInterface
    fun toast(msg: String) {
        activity.runOnUiThread {
            try {
                android.widget.Toast.makeText(ctx, msg, android.widget.Toast.LENGTH_SHORT).show()
            } catch (_: Exception) { }
        }
    }

    @JavascriptInterface
    fun share(text: String) {
        try {
            ctx.startActivity(Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }.let { Intent.createChooser(it, "NOVA") }.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (_: Exception) { }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (_: Exception) { }
    }

    /* ── setup + self-update ──────────────────────────────────── */
    @JavascriptInterface
    fun setupDone(): Boolean = guarded(false) { NovaPrefs.setupDone(ctx) }

    @JavascriptInterface
    fun setSetupDone(done: Boolean) {
        NovaPrefs.setSetupDone(ctx, done)
    }

    /**
     * Download the release APK inside the app and open the system installer.
     * Falls back to the browser if anything goes wrong.
     */
    @JavascriptInterface
    fun download(url: String, name: String) {
        thread(name = "nova-download") {
            val release = NovaUpdater.ApkRelease(name = name, url = url, tag = "", size = 0)
            val ok = NovaInstaller.downloadAndInstall(ctx, release)
            web.post {
                web.evaluateJavascript("window.NovaOnInstall && NovaOnInstall('${if (ok) "ready" else "fallback"}')", null)
            }
        }
    }

    @JavascriptInterface
    fun allowUnknownSources() = NovaInstaller.openInstallSettings(ctx)

    @JavascriptInterface
    fun setBootLaunch(enabled: Boolean) = NovaPrefs.setBootLaunch(ctx, enabled)

    @JavascriptInterface
    fun getBootLaunch(): Boolean = guarded(false) { NovaPrefs.bootLaunch(ctx) }

    @JavascriptInterface
    fun launches(): Int = guarded(0) { NovaPrefs.launches(ctx) }

    private inline fun <T> guarded(fallback: T, block: () -> T): T =
        try { block() } catch (_: Exception) { fallback }
}
