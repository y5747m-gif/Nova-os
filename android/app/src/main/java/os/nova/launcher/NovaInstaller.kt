package os.nova.launcher

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * NOVA installs its own updates: download into the app cache, hand the file to
 * the system package installer through a FileProvider. No storage permission,
 * no third-party updater — and the user always sees the system's own prompt.
 */
object NovaInstaller {

    fun downloadAndInstall(ctx: Context, release: NovaUpdater.ApkRelease): Boolean {
        return try {
            NovaNotify.show(
                ctx,
                "NOVA OS",
                "بينزّل النسخة ${release.tag}…",
                channel = NovaNotify.CHANNEL_SYSTEM,
                id = UPDATE_NOTIFICATION_ID,
            )

            val dir = File(ctx.cacheDir, "updates").apply { mkdirs() }
            val target = File(dir, release.name)
            if (target.exists()) target.delete()

            val connection = (URL(release.url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000
                readTimeout = 30000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", "NOVA-OS/${BuildConfig.VERSION_NAME}")
            }
            connection.inputStream.use { input ->
                target.outputStream().use { output -> input.copyTo(output, DEFAULT_BUFFER_SIZE) }
            }
            connection.disconnect()

            NovaNotify.show(
                ctx, "NOVA OS", "النسخة نزلت — اضغط لتثبيت التحديث",
                channel = NovaNotify.CHANNEL_SYSTEM, id = UPDATE_NOTIFICATION_ID,
            )
            launchInstaller(ctx, target)
        } catch (e: Throwable) {
            NovaNotify.show(
                ctx, "NOVA OS", "فشل تنزيل التحديث: ${e.message ?: "خطأ غير معروف"}",
                channel = NovaNotify.CHANNEL_SYSTEM, id = UPDATE_NOTIFICATION_ID,
            )
            false
        }
    }

    fun launchInstaller(ctx: Context, apk: File): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !ctx.packageManager.canRequestPackageInstalls()
        ) {
            openInstallSettings(ctx)
            return false
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return try {
            ctx.startActivity(intent)
            true
        } catch (_: Throwable) {
            false
        }
    }

    /** "Install unknown apps" screen for NOVA itself. */
    fun openInstallSettings(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            ctx.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (_: Throwable) {
        }
    }

    const val UPDATE_NOTIFICATION_ID = 4242
}
