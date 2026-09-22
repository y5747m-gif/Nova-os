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

    /* ── setup wizard ─────────────────────────────────────────── */
    private const val KEY_SETUP_DONE = "setup_done"
    private const val KEY_WALLPAPER = "wallpaper_mode"

    fun setupDone(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_SETUP_DONE, false)
    fun setSetupDone(ctx: Context, done: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_SETUP_DONE, done).apply()
    }

    /** aurora | system | dim | web — how the Dynamic Space background renders.
     *  "web" = a scene painted by the web layer (aurora, sunset, …, صورتي). */
    fun wallpaperMode(ctx: Context): String = prefs(ctx).getString(KEY_WALLPAPER, "aurora") ?: "aurora"
    fun setWallpaperMode(ctx: Context, mode: String) {
        prefs(ctx).edit().putString(KEY_WALLPAPER, mode).apply()
    }

    /* ── placed system widgets ────────────────────────────────── */
    private const val KEY_WIDGETS = "widgets"

    fun widgets(ctx: Context): List<Int> =
        prefs(ctx).getString(KEY_WIDGETS, "").orEmpty()
            .split(',').mapNotNull { it.trim().toIntOrNull() }.filter { it >= 0 }

    fun addWidget(ctx: Context, id: Int) {
        val ids = (widgets(ctx) + id).distinct()
        prefs(ctx).edit().putString(KEY_WIDGETS, ids.joinToString(",")).apply()
    }

    fun removeWidget(ctx: Context, id: Int) {
        val ids = widgets(ctx) - id
        prefs(ctx).edit().putString(KEY_WIDGETS, ids.joinToString(",")).apply()
    }
}
