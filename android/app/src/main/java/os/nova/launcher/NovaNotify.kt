package os.nova.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * NOVA's notification surface (docs/01 §6–§7):
 * FLOW events arrive as cards inside NOVA; a real system notification is only
 * used when NOVA is not on screen — and it opens straight back into the app.
 */
object NovaNotify {
    const val CHANNEL_EVENTS = "nova.events"
    const val CHANNEL_SYSTEM = "nova.system"

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL_EVENTS) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_EVENTS, ctx.getString(R.string.channel_events), NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "أحداث NOVA FLOW لما التطبيق مش مفتوح"
                    enableVibration(true)
                }
            )
        }
        if (nm.getNotificationChannel(CHANNEL_SYSTEM) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_SYSTEM, ctx.getString(R.string.channel_system), NotificationManager.IMPORTANCE_LOW).apply {
                    description = "تحديثات النظام والتثبيت"
                    setShowBadge(false)
                }
            )
        }
    }

    fun show(
        ctx: Context,
        title: String,
        body: String,
        channel: String = CHANNEL_EVENTS,
        id: Int = (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
        tapUri: Uri? = null,
    ) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        val content = PendingIntent.getActivity(
            ctx, 0,
            Intent(ctx, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                if (tapUri != null) data = tapUri
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification: Notification = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_nova_stat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(content)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(id, notification)
        } catch (_: SecurityException) {
            // permission revoked between the check and the call — NOVA stays quiet
        }
    }
}
