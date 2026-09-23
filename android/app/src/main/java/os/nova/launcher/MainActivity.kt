package os.nova.launcher

import android.annotation.SuppressLint
import android.app.WallpaperManager
import android.app.role.RoleManager
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
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
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
    private lateinit var root: FrameLayout
    private var shellReady = false
    private var disposed = false
    private var webReleased = true
    private var pendingHome = false
    private var pendingRoute: String? = null
    private var rendererRecoveries = 0
    private var startupTimeout: Runnable? = null
    private var recoveryPanel: View? = null
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
            if (!shellReady || disposed) return@registerForActivityResult
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
            if (shellReady && !disposed) web.evaluateJavascript("window.NovaOnAppsChanged && NovaOnAppsChanged()", null)
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

        root = FrameLayout(this)
        wallpaperView = ImageView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = android.view.View.GONE
        }
        root.addView(wallpaperView)

        setContentView(root)
        createShell()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // A HOME launcher must never fall through to Activity.finish(), even
                // if JS is still loading or its renderer is being recovered.
                if (!shellReady || disposed) return
                web.evaluateJavascript("(window.NovaBack ? NovaBack() : false) ? 1 : 0") { value ->
                    if (!disposed && value != "1" && !isTaskRoot && !isDefaultHome()) {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
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
        if (::web.isInitialized && !disposed && !webReleased) web.onResume()
        NovaWidgets.startListening(this)
        pushLauncherState()
        pushNotifications(NovaNotificationService.snapshot(applicationContext))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Tapping NOVA's own icon while it runs = go home inside NOVA (launcher behaviour)
        if (intent.hasCategory(Intent.CATEGORY_LAUNCHER) || intent.hasCategory(Intent.CATEGORY_HOME)) {
            pendingHome = true
            pendingRoute = null // the latest HOME request supersedes an undelivered route
            flushNavigation()
        }
        handleDeepLink(intent)
    }

    override fun onPause() {
        if (::web.isInitialized && !disposed && !webReleased) web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        disposed = true
        try { unregisterReceiver(packageChanges) } catch (_: Exception) { }
        releaseShell()
        super.onDestroy()
    }

    private fun handleDeepLink(intent: Intent?) {
        if (intent?.action != ACTION_DEEP_LINK) return
        pendingRoute = intent.getStringExtra(EXTRA_ROUTE)?.take(512)
        flushNavigation()
    }

    private fun flushNavigation() {
        if (!shellReady || disposed) return
        if (pendingHome) {
            pendingHome = false
            web.evaluateJavascript("window.NovaGoHome && NovaGoHome()", null)
        }
        pendingRoute?.let { route ->
            pendingRoute = null
            web.evaluateJavascript("window.NovaOnRoute && NovaOnRoute(${JSONObject.quote(route)})", null)
        }
    }

    fun isDefaultHome(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roles = getSystemService(RoleManager::class.java)
                if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME)) {
                    return roles.isRoleHeld(RoleManager.ROLE_HOME)
                }
            }
            packageManager.resolveActivity(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
                PackageManager.MATCH_DEFAULT_ONLY
            )?.activityInfo?.packageName == packageName
        } catch (_: Exception) { false }
    }

    private fun createShell() {
        if (disposed) return
        recoveryPanel?.let { root.removeView(it) }
        recoveryPanel = null
        shellReady = false
        try {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
            web = WebView(this).apply {
                layoutParams = FrameLayout.LayoutParams(-1, -1)
                setBackgroundColor(Color.parseColor("#07080B"))
                overScrollMode = View.OVER_SCROLL_NEVER
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
            }
            webReleased = false
            configure(web)
            root.addView(web)
            bindWeb(web)
            applyInsets(web)
            // Never restore WebView history as application state: it doesn't restore
            // the JS surface tree. Preferences live in persistent origin storage.
            web.loadUrl(START_URL)
            val current = web
            startupTimeout = Runnable {
                if (!disposed && web === current && !shellReady) showRecovery()
            }.also { web.postDelayed(it, 15000) }
        } catch (error: Exception) {
            Log.e("NovaShell", "Unable to create launcher WebView", error)
            releaseShell()
            showRecovery()
        }
    }

    private fun releaseShell() {
        if (!::web.isInitialized || webReleased) return
        webReleased = true
        shellReady = false
        startupTimeout?.let { web.removeCallbacks(it) }
        startupTimeout = null
        if (activeWeb === web) activeWeb = null
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        (web.parent as? ViewGroup)?.removeView(web)
        web.removeJavascriptInterface("NovaSystem")
        web.destroy()
    }

    internal fun postToShell(source: WebView, script: String) {
        runOnUiThread {
            if (!disposed && !webReleased && source === web && shellReady) {
                source.evaluateJavascript(script, null)
            }
        }
    }

    /** Explicit JS handshake: page-finished can fire before module hooks exist. */
    fun onShellReady(source: WebView) {
        if (disposed || webReleased || source !== web || shellReady) return
        shellReady = true
        startupTimeout?.let { web.removeCallbacks(it) }
        startupTimeout = null
        recoveryPanel?.let { root.removeView(it) }
        recoveryPanel = null
        injectInsets()
        applyWallpaperMode()
        pushLauncherState()
        pushNotifications(NovaNotificationService.snapshot(applicationContext))
        flushNavigation()
    }

    private fun showRecovery() {
        if (disposed || recoveryPanel != null) return
        // Native controls still work when the web engine or JS cannot boot.
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(32, 32, 32, 32)
            setBackgroundColor(Color.parseColor("#07080B"))
            addView(TextView(this@MainActivity).apply {
                setTextColor(Color.WHITE)
                text = getString(os.nova.launcher.R.string.shell_recovery_message)
            })
            addView(Button(this@MainActivity).apply {
                setText(os.nova.launcher.R.string.shell_retry)
                setOnClickListener { releaseShell(); createShell() }
            })
            addView(Button(this@MainActivity).apply {
                setText(os.nova.launcher.R.string.shell_home_settings)
                setOnClickListener { openHomeSettings() }
            })
        }
        recoveryPanel = panel
        root.addView(panel, FrameLayout.LayoutParams(-1, -1))
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
                if (url.scheme == "https" && url.host == DOMAIN && url.path?.startsWith("/assets/www/") == true) return false
                // everything outside NOVA belongs to the real browser
                openExternally(url)
                return true // never load an external page with the native bridge attached
            }

            override fun onRenderProcessGone(webView: WebView, detail: RenderProcessGoneDetail): Boolean {
                if (disposed || webView !== web) return true
                Log.w("NovaShell", "Renderer lost (crashed=${detail.didCrash()})")
                releaseShell()
                // One automatic retry per Activity lifetime; repeated failures
                // expose settings rather than trapping the user in a crash loop.
                if (rendererRecoveries++ == 0) createShell() else showRecovery()
                return true
            }

            override fun onPageFinished(webView: WebView, url: String?) {
                if (webView === web && shellReady) injectInsets()
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
        if (!::web.isInitialized || webReleased || disposed || !shellReady) return
        val js = buildString {
            append("document.documentElement.style.setProperty('--nv-inset-top',(${insetTop}/(window.devicePixelRatio||1))+'px');")
            append("document.documentElement.style.setProperty('--nv-inset-bottom',(${insetBottom}/(window.devicePixelRatio||1))+'px');")
            append("document.body.dataset.shell='app';")
            append("document.body.classList.add('nova-shell');")
        }
        web.evaluateJavascript(js, null)
    }

    /* ── launcher state → web ─────────────────────────────────── */
    private fun pushLauncherState() {
        if (!::web.isInitialized || webReleased || disposed || !shellReady) return
        val js = buildString {
            append("(function(){")
            append("var b=window.NovaSystem;if(!b||!b.isDefaultLauncher)return;")
            append("try{window.NovaLauncherState={")
            append("def:b.isDefaultLauncher(),")
            append("notif:b.hasNotificationAccess(),")
            append("usage:b.hasUsageAccess(),")
            append("post:b.hasPermission('android.permission.POST_NOTIFICATIONS'),")
            append("contacts:b.hasPermission('android.permission.READ_CONTACTS'),")
            append("setup:b.setupDone()")
            append("};window.dispatchEvent(new CustomEvent('nova:launcher'));}catch(e){}")
            append("})()")
        }
        web.evaluateJavascript(js, null)
    }

    /* ── HOME role ────────────────────────────────────────────── */
    fun requestHomeRole() {
        if (disposed) return
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
        if (disposed) return
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
            } catch (_: Exception) { continue }
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
        if (permission !in allowed || disposed || webReleased) return
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
        if (!::web.isInitialized || webReleased || disposed) return
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
        // web-painted scenes (aurora … custom «صورتي») live in the web layer —
        // it owns data-wallpaper, so the shell just stands down
        wallpaperView?.visibility = View.GONE
        web.setBackgroundColor(Color.parseColor("#07080B"))
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
    } catch (_: Exception) {
        false
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        // never ambush a first run with a system dialog: the setup wizard
        // asks at the right moment, this only tops up afterwards
        if (!NovaPrefs.setupDone(this)) return
        val granted = checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
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
                    if (activeWeb !== view) return@post
                    val safe = JSONObject.quote(snapshot)
                    view.evaluateJavascript(
                        "window.NovaOnNotifications && NovaOnNotifications($safe)", null
                    )
                } catch (_: Exception) { }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (::web.isInitialized && !webReleased) bindWeb(web)
    }
}
