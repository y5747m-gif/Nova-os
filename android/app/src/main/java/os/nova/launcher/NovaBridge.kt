package os.nova.launcher

import android.content.Context
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlin.concurrent.thread

/**
 * NovaSystem — the JS bridge. The web layer calls it as `window.NovaSystem`.
 * Everything here is optional from NOVA's point of view: the same web build runs
 * in a plain browser with the methods missing.
 */
class NovaBridge(
    private val activity: MainActivity,
    private val web: WebView,
) {
    private val ctx: Context get() = activity.applicationContext

    @JavascriptInterface
    fun platform(): String = "android"

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun sdk(): Int = Build.VERSION.SDK_INT

    /** Is NOVA the user's home app right now? */
    @JavascriptInterface
    fun isLauncher(): Boolean {
        val intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
            .addCategory(android.content.Intent.CATEGORY_HOME)
        val resolved = activity.packageManager.resolveActivity(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)
        return resolved?.activityInfo?.packageName == activity.packageName
    }

    @JavascriptInterface
    fun notify(title: String, body: String) {
        NovaNotify.show(ctx, title, body)
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
    fun getBootLaunch(): Boolean = NovaPrefs.bootLaunch(ctx)

    @JavascriptInterface
    fun launches(): Int = NovaPrefs.launches(ctx)
}
