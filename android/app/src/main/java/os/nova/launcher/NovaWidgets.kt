package os.nova.launcher

import android.app.Activity
import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * System widgets on the NOVA canvas. NOVA hosts real AppWidgets (clock,
 * weather, music…) in a native sheet — the web layer just lists them and
 * asks to open/pick/remove. Binding always goes through the system's own
 * confirmation, exactly like any launcher.
 */
object NovaWidgets {

    const val REQ_PICK = 4101
    const val REQ_BIND = 4102
    const val REQ_CONFIGURE = 4103
    const val HOST_ID = 4101

    @Volatile private var host: AppWidgetHost? = null

    fun host(ctx: Context): AppWidgetHost {
        return host ?: synchronized(this) {
            host ?: AppWidgetHost(ctx.applicationContext, HOST_ID).also { host = it }
        }
    }

    fun startListening(ctx: Context) {
        try { host(ctx).startListening() } catch (_: Exception) { }
    }

    fun stopListening() {
        try { host?.stopListening() } catch (_: Exception) { }
    }

    fun manager(ctx: Context): AppWidgetManager? =
        try { ctx.getSystemService(AppWidgetManager::class.java) } catch (_: Exception) { null }

    fun allocateId(ctx: Context): Int {
        return try { host(ctx).allocateAppWidgetId() } catch (_: Exception) { -1 }
    }

    fun deleteId(ctx: Context, id: Int) {
        try { host(ctx).deleteAppWidgetId(id) } catch (_: Exception) { }
        NovaPrefs.removeWidget(ctx, id)
    }

    /** Installed widget providers as JSON: [{label, pkg, cls, minW, minH}]. */
    fun providersJson(ctx: Context): String {
        val arr = JSONArray()
        try {
            val mgr = manager(ctx) ?: return arr.toString()
            val pm = ctx.packageManager
            for (info in mgr.installedProviders.sortedBy { it.loadLabel(pm) }) {
                arr.put(
                    JSONObject()
                        .put("label", info.loadLabel(pm))
                        .put("pkg", info.provider.packageName)
                        .put("cls", info.provider.className)
                        .put("minW", info.minWidth)
                        .put("minH", info.minHeight),
                )
            }
        } catch (_: Exception) { }
        return arr.toString()
    }

    /** Open the system widget picker for a fresh widget id. */
    fun pick(activity: Activity, appWidgetId: Int): Boolean {
        return try {
            val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_PICK).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            activity.startActivityForResult(intent, REQ_PICK)
            true
        } catch (_: Exception) { false }
    }

    /** Bind after the picker returns — handles the permission + configure flow. */
    fun onPicked(activity: Activity, appWidgetId: Int, data: Intent?): Boolean {
        if (appWidgetId < 0) return false
        val mgr = manager(activity) ?: return false
        val provider = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            data?.getParcelableExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, android.content.ComponentName::class.java)
        } else {
            @Suppress("DEPRECATION")
            data?.getParcelableExtra<android.content.ComponentName>(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER)
        } ?: return false
        return try {
            val info = mgr.getAppWidgetInfo(appWidgetId)
                ?: mgr.installedProviders.firstOrNull { it.provider == provider }
            val allowsBinding = mgr.bindAppWidgetIdIfAllowed(appWidgetId, provider)
            if (allowsBinding) {
                val configure = info?.configure
                if (configure != null) {
                    activity.startActivityForResult(
                        Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE).apply {
                            component = configure
                            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                        },
                        REQ_CONFIGURE,
                    )
                } else {
                    NovaPrefs.addWidget(activity, appWidgetId)
                }
                true
            } else {
                activity.startActivityForResult(
                    Intent(AppWidgetManager.ACTION_APPWIDGET_BIND).apply {
                        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                        putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, provider)
                    },
                    REQ_BIND,
                )
                true
            }
        } catch (_: Exception) { false }
    }

    fun providerFor(ctx: Context, appWidgetId: Int): AppWidgetProviderInfo? {
        return try { manager(ctx)?.getAppWidgetInfo(appWidgetId) } catch (_: Exception) { null }
    }

    fun placedJson(ctx: Context): String {
        val arr = JSONArray()
        try {
            val mgr = manager(ctx)
            val pm = ctx.packageManager
            for (id in NovaPrefs.widgets(ctx)) {
                val info = try { mgr?.getAppWidgetInfo(id) } catch (_: Exception) { null } ?: continue
                arr.put(
                    JSONObject()
                        .put("id", id)
                        .put("label", info.loadLabel(pm))
                        .put("pkg", info.provider.packageName),
                )
            }
        } catch (_: Exception) { }
        return arr.toString()
    }
}
