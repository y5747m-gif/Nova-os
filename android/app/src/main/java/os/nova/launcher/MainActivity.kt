package os.nova.launcher

import android.annotation.SuppressLint
import android.app.WallpaperManager
import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
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
 * The shell is a real Android launcher:
 *   · HOME intent + ROLE_HOME request → NOVA can be the default launcher
 *   · the NovaSystem JS bridge: installed apps, icons, shortcuts, widgets,
 *     live notifications, usage-ranked suggestions, contacts, wallpaper
 *   · edge-to-edge, real system-bar insets handed to CSS (--nv-inset-*)
 *   · hardware back routed into NOVA's own navigation (window.NovaBack)
 *   · system wallpaper behind a transparent WebView (optional)
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var wallpaperView: ImageView? = null
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

    private val runtimePermission: ActivityResultLauncher<String> =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            web.evaluateJavascript(
                "window.NovaOnPermission && NovaOnPermission(${if (granted) 1 else 0})", null
            )
        }

    private val homeRole: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            pushLauncherState()
        }

    private val wallpaperPick: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK) applyWallpaperMode()
        }

    private val packageChanges = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            NovaApps.invalidate()
            web.evaluateJavascript("window.NovaOnAppsChanged && NovaOnAppsChanged()", null)
        }
    }

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
        NovaWidgets.startListening(this)

        val root = FrameLayout(this)
        wallpaperView = ImageView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = android.view.View.GONE
        }
        root.addView(wallpaperView)

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
        root.addView(web)
        setContentView(root)
        applyInsets(web)
        applyWallpaperMode()

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
                        if (isTaskRoot) {
                            // NOVA *is* home — Back at home does nothing (like any launcher)
                            web.evaluateJavascript("window.NovaBack && NovaBack()", null)
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                            isEnabled = true
                        }
                    }
                }
            }
        })

        askNotificationPermission()
        NovaPrefs.noteLaunch(this)

        try {
            ContextCompat.registerReceiver(
                this,
                packageChanges,
                IntentFilter().apply {
                    addAction(Intent.ACTION_PACKAGE_ADDED)
                    addAction(Intent.ACTION_PACKAGE_REMOVED)
                    addAction(Intent.ACTION_PACKAGE_REPLACED)
                    addDataScheme("package")
                },
                ContextCompat.RECEIVER_EXPORTED,
            )
        } catch (_: Exception) { }

        handleDeepLink(intent)
    }

    override fun onResume() {
        super.onResume()
        NovaWidgets.startListening(this)
        pushLauncherState()
        pushNotifications(NovaNotificationService.snapshot(applicationContext))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Tapping NOVA's own icon while it runs = go home inside NOVA (launcher behaviour)
        if (intent.hasCategory(Intent.CATEGORY_LAUNCHER) || intent.hasCategory(Intent.CATEGORY_HOME)) {
            web.evaluateJavascript("window.NovaGoHome && NovaGoHome()", null)
        }
        handleDeepLink(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        try { unregisterReceiver(packageChanges) } catch (_: Exception) { }
        web.destroy()
        super.onDestroy()
    }

    private fun handleDeepLink(intent: Intent?) {
        if (intent?.action != ACTION_DEEP_LINK) return
        val route = intent.getStringExtra(EXTRA_ROUTE).orEmpty()
        if (route.isNotEmpty()) {
            val safe = route.replace("'", "")
            web.postDelayed({
                web.evaluateJavascript("window.NovaOnRoute && NovaOnRoute('$safe')", null)
            }, 600)
        }
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
                pushLauncherState()
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

    /* ── launcher state → web ─────────────────────────────────── */
    private fun pushLauncherState() {
        if (!::web.isInitialized) return
        val js = buildString {
            append("(function(){")
            append("var b=window.NovaSystem;if(!b||!b.isDefaultLauncher)return;")
            append("try{window.NovaLauncherState={")
            append("def:b.isDefaultLauncher(),")
            append("notif:b.hasNotificationAccess(),")
            append("usage:b.hasUsageAccess(),")
            append("setup:b.setupDone()")
            append("};window.dispatchEvent(new CustomEvent('nova:launcher'));}catch(e){}")
            append("})()")
        }
        web.evaluateJavascript(js, null)
    }

    /* ── HOME role ────────────────────────────────────────────── */
    fun requestHomeRole() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val rm = getSystemService(RoleManager::class.java)
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) &&
                    !rm.isRoleHeld(RoleManager.ROLE_HOME)
                ) {
                    homeRole.launch(rm.createRequestRoleIntent(RoleManager.ROLE_HOME))
                    return
                }
            }
            openHomeSettings()
        } catch (_: Exception) {
            openHomeSettings()
        }
    }

    fun openHomeSettings() {
        // Official "default home" screen (Android 10+); older phones get app settings.
        val candidates = listOf(
            Intent("android.settings.HOME_SETTINGS"),
            Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            },
        )
        for (intent in candidates) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                return
            } catch (_: ActivityNotFoundException) { continue }
        }
    }

    fun askRuntimePermission(permission: String) {
        val allowed = setOf(
            android.Manifest.permission.READ_CONTACTS,
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
            android.Manifest.permission.POST_NOTIFICATIONS,
            android.Manifest.permission.BLUETOOTH_CONNECT,
            android.Manifest.permission.READ_MEDIA_IMAGES,
            android.Manifest.permission.READ_EXTERNAL_STORAGE,
        )
        if (permission !in allowed) return
        try {
            if (ContextCompat.checkSelfPermission(this, permission) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                web.evaluateJavascript("window.NovaOnPermission && NovaOnPermission(1)", null)
            } else {
                runtimePermission.launch(permission)
            }
        } catch (_: Exception) { }
    }

    /* ── wallpaper ────────────────────────────────────────────── */
    fun applyWallpaperMode() {
        if (!::web.isInitialized) return
        val mode = NovaPrefs.wallpaperMode(this)
        val useSystem = mode == "system" || mode == "dim"
        try {
            if (useSystem) {
                val wm = WallpaperManager.getInstance(this)
                val drawable: Drawable? = wm.drawable
                if (drawable != null) {
                    wallpaperView?.setImageDrawable(drawable.constantState?.newDrawable()?.mutate() ?: drawable)
                    wallpaperView?.visibility = View.VISIBLE
                    if (mode == "dim") wallpaperView?.alpha = 0.45f else wallpaperView?.alpha = 1f
                    web.setBackgroundColor(Color.TRANSPARENT)
                    web.evaluateJavascript("document.body.dataset.wallpaper='system'", null)
                    return
                }
            }
        } catch (_: Exception) { }
        wallpaperView?.visibility = View.GONE
        web.setBackgroundColor(Color.parseColor("#07080B"))
        web.evaluateJavascript("document.body.dataset.wallpaper='aurora'", null)
    }

    fun pickSystemWallpaper() {
        val candidates = listOf(
            Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER),
            Intent(Intent.ACTION_SET_WALLPAPER),
            Intent("android.settings.HOME_SETTINGS"),
        )
        for (intent in candidates) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                wallpaperPick.launch(intent)
                return
            } catch (_: Exception) { continue }
        }
    }

    /* ── control surface helpers ──────────────────────────────── */
    fun setWindowBrightness(value: Float) {
        try {
            val lp = window.attributes
            lp.screenBrightness = value.coerceIn(0.05f, 1f)
            window.attributes = lp
        } catch (_: Exception) { }
    }

    fun nativeHaptic(kind: String) {
        try {
            val ms = when (kind) {
                "open" -> 8L
                "close" -> 14L
                "snap" -> 10L
                "success" -> 20L
                "error" -> 30L
                else -> 6L
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VibratorManager::class.java)
                vm?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                val vib = getSystemService(VIBRATOR_SERVICE) as? Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vib?.vibrate(ms)
                }
            }
        } catch (_: Exception) { }
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
        const val ACTION_DEEP_LINK = "os.nova.launcher.DEEP_LINK"
        const val EXTRA_ROUTE = "route"

        @Volatile private var activeWeb: WebView? = null
        internal fun bindWeb(view: WebView) {
            activeWeb = view
        }

        /** Push live notifications into the web layer (FLOW feed). */
        fun pushNotifications(snapshot: String) {
            val view = activeWeb ?: return
            view.post {
                try {
                    val safe = snapshot.replace("\\", "\\\\").replace("'", "\\'")
                    view.evaluateJavascript(
                        "window.NovaOnNotifications && NovaOnNotifications('$safe')", null
                    )
                } catch (_: Exception) { }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (::web.isInitialized) bindWeb(web)
    }
}
