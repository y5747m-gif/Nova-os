package os.nova.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * After a reboot NOVA only does one thing on its own: re-schedules the update
 * check. Opening itself as the home app is opt-in (Settings → NOVA → boot launch,
 * nothing is enabled behind the user's back).
 */
class NovaBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                NovaNotify.ensureChannels(context)
                NovaUpdateWorker.schedule(context)
                if (NovaPrefs.bootLaunch(context)) {
                    context.startActivity(
                        Intent(context, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            }
        }
    }
}
