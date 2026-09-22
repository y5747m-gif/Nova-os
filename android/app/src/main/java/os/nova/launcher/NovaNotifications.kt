package os.nova.launcher

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * NOVA FLOW's live feed. When the user grants notification access in the
 * setup wizard, system notifications arrive here and are mirrored into the
 * web layer as FLOW event cards — nothing interrupts, everything waits.
 */
class NovaNotificationService : NotificationListenerService() {

    override fun onListenerConnected() {
        instance = this
        pushToWeb()
    }

    override fun onListenerDisconnected() {
        if (instance === this) instance = null
        // the system rebinds us; ask for it explicitly on older releases
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) requestRebind(ComponentName(this, javaClass))
        } catch (_: Exception) { }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null || !isInteresting(sbn)) return
        pushToWeb()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        pushToWeb()
    }

    private fun isInteresting(sbn: StatusBarNotification): Boolean {
        if (sbn.packageName == packageName) return false
        if (sbn.isOngoing) return false
        val flags = sbn.notification?.flags ?: 0
        if (flags and Notification.FLAG_ONGOING_EVENT != 0) return false
        if (flags and Notification.FLAG_FOREGROUND_SERVICE != 0) return false
        return true
    }

    private fun pushToWeb() {
        MainActivity.pushNotifications(snapshot(applicationContext))
    }

    companion object {
        @Volatile private var instance: NovaNotificationService? = null

        fun isEnabled(ctx: Context): Boolean {
            val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")
            if (flat.isNullOrEmpty()) return false
            val me = ComponentName(ctx, NovaNotificationService::class.java).flattenToString()
            return flat.split(':').any { it.equals(me, ignoreCase = true) }
        }

        fun openSettings(ctx: Context) {
            try {
                val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                // hint the exact component on Android 8–13 settings screens
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    intent.putExtra(
                        Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                        ComponentName(ctx, NovaNotificationService::class.java).flattenToString(),
                    )
                }
                ctx.startActivity(intent)
            } catch (_: Exception) {
                try {
                    ctx.startActivity(Intent(Settings.ACTION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    })
                } catch (_: Exception) { }
            }
        }

        /** Active notifications as JSON: [{key, pkg, app, title, text, time}]. */
        fun snapshot(ctx: Context): String {
            val arr = JSONArray()
            val svc = instance ?: return arr.toString()
            try {
                val pm = ctx.packageManager
                val list = try {
                    svc.activeNotifications
                } catch (_: SecurityException) { return arr.toString() }
                for (sbn in (list ?: return arr.toString()).take(25)) {
                    if (sbn.packageName == ctx.packageName) continue
                    val extras = sbn.notification.extras
                    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
                    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
                    val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
                    if (title.isBlank() && text.isBlank() && big.isBlank()) continue
                    val app = try {
                        pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
                    } catch (_: Exception) { sbn.packageName }
                    arr.put(
                        JSONObject()
                            .put("key", sbn.key)
                            .put("pkg", sbn.packageName)
                            .put("app", app)
                            .put("title", title.ifBlank { app })
                            .put("text", text.ifBlank { big })
                            .put("time", sbn.postTime),
                    )
                }
            } catch (_: Exception) { }
            return arr.toString()
        }

        fun open(ctx: Context, key: String): Boolean {
            val svc = instance ?: return false
            return try {
                val sbn = svc.activeNotifications?.firstOrNull { it.key == key } ?: return false
                sbn.notification.contentIntent?.send()
                try { svc.cancelNotification(key) } catch (_: Exception) { }
                true
            } catch (_: Exception) { false }
        }

        fun dismiss(key: String): Boolean {
            val svc = instance ?: return false
            return try {
                svc.cancelNotification(key)
                true
            } catch (_: Exception) { false }
        }

        /** Our own listener component, for settings deep-links. */
        fun component(ctx: Context): ComponentName =
            ComponentName(ctx, NovaNotificationService::class.java)
    }
}
