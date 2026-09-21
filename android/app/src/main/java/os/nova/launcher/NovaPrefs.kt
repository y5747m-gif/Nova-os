package os.nova.launcher

import android.content.Context

/** Small, honest preference store. Nothing leaves the device. */
object NovaPrefs {
    private const val FILE = "nova_prefs"
    private const val KEY_BOOT_LAUNCH = "boot_launch"
    private const val KEY_LAUNCHES = "launches"
    private const val KEY_SEEN_UPDATE = "seen_update"

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    /** Opt-in: does NOVA start itself when the phone boots? (off by default) */
    fun bootLaunch(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_BOOT_LAUNCH, false)

    fun setBootLaunch(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_BOOT_LAUNCH, enabled).apply()
    }

    fun launches(ctx: Context): Int = prefs(ctx).getInt(KEY_LAUNCHES, 0)

    fun noteLaunch(ctx: Context) {
        prefs(ctx).edit().putInt(KEY_LAUNCHES, launches(ctx) + 1).apply()
    }

    /** Tag of the last release we already announced, so we never nag twice. */
    fun seenUpdate(ctx: Context): String? = prefs(ctx).getString(KEY_SEEN_UPDATE, null)

    fun setSeenUpdate(ctx: Context, tag: String?) {
        prefs(ctx).edit().putString(KEY_SEEN_UPDATE, tag).apply()
    }
}
