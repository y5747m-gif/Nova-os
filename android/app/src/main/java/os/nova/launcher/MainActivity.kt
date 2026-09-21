package os.nova.launcher

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewFeature

/**
 * NOVA OS shell — the whole experience lives in `assets/www` (this repo's
 * prototype) and is served through WebViewAssetLoader on a secure origin,
 * so storage, media and the JS engine behave exactly like the web build.
 *
 * The shell adds what a browser cannot give:
 *   · edge-to-edge, real system-bar insets handed to CSS (--nv-inset-*)
 *   · hardware back routed into NOVA's own navigation (window.NovaBack)
 *   · the NovaSystem JS bridge: notifications, downloads, installer, prefs
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var insetTop = 0
    private var insetBottom = 0
    private var fileCallback: android.webkit.ValueCallback<Array<Uri>>? = null

    private val fileChooser: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileCallback ?: return@registerForActivityResult
            fileCallback = null
            val data = result.data
            callback.onReceiveValue(
                if (result.resultCode == RESULT_OK && data != null) {
                    WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
                } else null
            )
        }

    private val notificationPermission: ActivityResultLauncher<String> =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* NOVA works either way */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        NovaNotify.ensureChannels(this)

        web = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#07080B"))
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
        }
        configure(web)
        setContentView(web)
        applyInsets(web)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl(START_URL)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // NOVA decides first: panels, canvas, collapsed apps all answer here
                web.evaluateJavascript("(window.NovaBack ? NovaBack() : false) ? 1 : 0") { value ->
                    if (value != "1") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        askNotificationPermission()
        NovaPrefs.noteLaunch(this)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /* ── WebView configuration ─────────────────────────────────── */
    @SuppressLint("SetJavaScriptEnabled")
    private fun configure(view: WebView) {
        val settings = view.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false   // NOVA's sound set is event-driven
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.textZoom = 100
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.userAgentString = settings.userAgentString + " NovaOS/${BuildConfig.VERSION_NAME}"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.safeBrowsingEnabled = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) settings.forceDark = WebSettings.FORCE_DARK_OFF
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
        }
        val loader = WebViewAssetLoader.Builder()
            .setDomain(DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        view.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                webView: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                webView: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.host == DOMAIN) return false
                // everything outside NOVA belongs to the real browser
                return openExternally(url)
            }

            override fun onPageFinished(webView: WebView, url: String?) {
                injectInsets()
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: android.webkit.ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        view.setDownloadListener { url, _, _, _, _ -> openExternally(Uri.parse(url)) }
        view.addJavascriptInterface(NovaBridge(this, view), "NovaSystem")
    }

    /* ── system bars → CSS ────────────────────────────────────── */
    private fun applyInsets(view: View) {
        ViewCompat.setOnApplyWindowInsetsListener(view) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            insetTop = bars.top
            insetBottom = bars.bottom
            injectInsets()
            insets
        }
        ViewCompat.requestApplyInsets(view)
    }

    private fun injectInsets() {
        if (!::web.isInitialized) return
        val js = buildString {
            append("document.documentElement.style.setProperty('--nv-inset-top','${insetTop}px');")
            append("document.documentElement.style.setProperty('--nv-inset-bottom','${insetBottom}px');")
            append("document.body.dataset.shell='app';")
            append("document.body.classList.add('nova-shell');")
        }
        web.evaluateJavascript(js, null)
    }

    /* ── helpers used by the bridge ───────────────────────────── */
    private fun openExternally(uri: Uri): Boolean = try {
        startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: ActivityNotFoundException) {
        false
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            web.postDelayed({ notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS) }, 1400)
        }
    }

    companion object {
        const val DOMAIN = "nova.local"
        const val START_URL = "https://$DOMAIN/assets/www/index.html"
    }
}
