package os.nova.launcher

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** One quiet check every 12 hours; announces a new build exactly once. */
class NovaUpdateWorker(appContext: Context, params: WorkerParameters) :
    Worker(appContext, params) {

    override fun doWork(): Result {
        val release = NovaUpdater.latestApk() ?: return Result.success()
        if (!NovaUpdater.isNewer(release)) return Result.success()
        if (NovaPrefs.seenUpdate(applicationContext) == release.tag) return Result.success()

        NovaPrefs.setSeenUpdate(applicationContext, release.tag)
        NovaNotify.show(
            applicationContext,
            applicationContext.getString(R.string.notif_update_title),
            "${applicationContext.getString(R.string.notif_update_text)} (${release.tag})",
            channel = NovaNotify.CHANNEL_SYSTEM,
            id = NovaInstaller.UPDATE_NOTIFICATION_ID,
        )
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "nova.update.check"

        fun schedule(ctx: Context) {
            val request = PeriodicWorkRequestBuilder<NovaUpdateWorker>(12, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(ctx.applicationContext)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
