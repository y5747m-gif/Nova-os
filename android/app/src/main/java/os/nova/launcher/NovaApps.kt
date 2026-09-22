package os.nova.launcher

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.LauncherApps
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Process
import android.os.UserHandle
import android.provider.Settings
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * NOVA's window onto the real phone: the installed launchable apps, their
 * icons/labels, deep shortcuts, usage-ranked suggestions and app actions
 * (launch / info / uninstall). Everything is defensive — a launcher must
 * never crash because one app has a broken icon.
 */
object NovaApps {

    private const val ICON_PX = 144

    private data class Entry(
        val packageName: String,
        val label: String,
        val component: String,
        val userSerial: Long = 0L,
    )

    @Volatile private var cache: List<Entry>? = null
    @Volatile private var cacheAt: Long = 0L
    private val iconCache = ConcurrentHashMap<String, String>()
    private const val CACHE_TTL_MS = 30_000L

    /* ── catalogue ───────────────────────────────────────────── */

    fun listApps(ctx: Context, max: Int = 400): List<Entry> {
        val now = System.currentTimeMillis()
        cache?.let { if (now - cacheAt < CACHE_TTL_MS) return it }

        val pm = ctx.packageManager
        val out = ArrayList<Entry>()
        try {
            val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val infos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.queryIntentActivities(main, PackageManager.ResolveInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(main, 0)
            }
            for (ri in infos) {
                val ai = ri.activityInfo ?: continue
                if (ai.packageName == ctx.packageName) continue // NOVA lists others, not itself
                val label = try {
                    ri.loadLabel(pm)?.toString()?.trim().orEmpty().ifEmpty { ai.packageName }
                } catch (_: Exception) { ai.packageName }
                out += Entry(ai.packageName, label, "${ai.packageName}/${ai.name}")
                if (out.size >= max) break
            }
        } catch (_: Exception) { /* empty catalogue is better than a crash */ }
        val sorted = out.sortedBy { it.label.lowercase() }
        cache = sorted
        cacheAt = now
        return sorted
    }

    fun invalidate() {
        cache = null
        iconCache.clear()
    }

    /** Compact catalogue JSON for the web layer: [{p: package, l: label}]. */
    fun catalogueJson(ctx: Context): String {
        val arr = JSONArray()
        for (e in listApps(ctx)) {
            arr.put(JSONObject().put("p", e.packageName).put("l", e.label))
        }
        return arr.toString()
    }

    /* ── icons (base64 PNG data URIs, rendered from adaptive icons) ── */

    fun iconUri(ctx: Context, packageName: String): String {
        iconCache[packageName]?.let { return it }
        val uri = try {
            val pm = ctx.packageManager
            val drawable = pm.getApplicationIcon(packageName)
            "data:image/png;base64," + Base64.encodeToString(
                rasterize(drawable, ICON_PX), Base64.NO_WRAP
            )
        } catch (_: Exception) { "" }
        if (uri.isNotEmpty()) {
            if (iconCache.size > 220) iconCache.clear()
            iconCache[packageName] = uri
        }
        return uri
    }

    private fun rasterize(d: Drawable, px: Int): ByteArray {
        val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        try {
            if (d is AdaptiveIconDrawable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // adaptive icons bleed to the edge — inset the mask like a launcher does
                val inset = (px * 0.06f).toInt()
                d.setBounds(inset, inset, px - inset, px - inset)
                d.draw(canvas)
            } else if (d is BitmapDrawable && d.bitmap != null) {
                val src = d.bitmap!!
                canvas.drawBitmap(src, null, android.graphics.Rect(8, 8, px - 8, px - 8), null)
            } else {
                d.setBounds(0, 0, px, px)
                d.draw(canvas)
            }
        } catch (_: Exception) {
            d.setBounds(0, 0, px, px)
            try { d.draw(canvas) } catch (_: Exception) { /* transparent tile */ }
        }
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 90, out)
        bmp.recycle()
        return out.toByteArray()
    }

    /* ── actions ─────────────────────────────────────────────── */

    fun launch(ctx: Context, packageName: String): Boolean = try {
        val pm = ctx.packageManager
        val intent = pm.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        } ?: return false
        ctx.startActivity(intent)
        true
    } catch (_: Exception) { false }

    fun openInfo(ctx: Context, packageName: String): Boolean = try {
        ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:$packageName")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        true
    } catch (_: Exception) { false }

    fun uninstall(ctx: Context, packageName: String): Boolean = try {
        ctx.startActivity(Intent(Intent.ACTION_DELETE).apply {
            data = Uri.parse("package:$packageName")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        true
    } catch (_: Exception) { false }

    /** Deep shortcuts of an app (long-press menu), API 25+. */
    fun shortcutsJson(ctx: Context, packageName: String): String {
        val arr = JSONArray()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return arr.toString()
        try {
            val launcherApps = ctx.getSystemService(LauncherApps::class.java) ?: return arr.toString()
            if (!launcherApps.hasShortcutHostPermission()) return arr.toString()
            val user: UserHandle = Process.myUserHandle()
            val query = LauncherApps.ShortcutQuery().apply {
                setPackage(packageName)
                setQueryFlags(
                    LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC or
                        LauncherApps.ShortcutQuery.FLAG_MATCH_PINNED or
                        LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST
                )
            }
            val list = try {
                launcherApps.getShortcuts(query, user)
            } catch (_: SecurityException) { return arr.toString() }
            for (s in (list ?: emptyList()).take(6)) {
                arr.put(JSONObject().put("id", s.id).put("l", s.shortLabel?.toString().orEmpty()))
            }
        } catch (_: Exception) { }
        return arr.toString()
    }

    fun launchShortcut(ctx: Context, packageName: String, shortcutId: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return false
        return try {
            val launcherApps = ctx.getSystemService(LauncherApps::class.java) ?: return false
            if (!launcherApps.hasShortcutHostPermission()) return false
            val user: UserHandle = Process.myUserHandle()
            val query = LauncherApps.ShortcutQuery().apply {
                setPackage(packageName)
                setShortcutIds(listOf(shortcutId))
                setQueryFlags(
                    LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC or
                        LauncherApps.ShortcutQuery.FLAG_MATCH_PINNED or
                        LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST
                )
            }
            val shortcut = launcherApps.getShortcuts(query, user)?.firstOrNull() ?: return false
            launcherApps.startShortcut(shortcut, null, null)
            true
        } catch (_: Exception) { false }
    }

    /* ── usage-ranked suggestions (needs PACKAGE_USAGE_STATS) ── */

    fun hasUsageAccess(ctx: Context): Boolean {
        return try {
            val ops = ctx.getSystemService(AppOpsManager::class.java) ?: return false
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ops.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
            }
            mode == AppOpsManager.MODE_ALLOWED
        } catch (_: Exception) { false }
    }

    fun openUsageSettings(ctx: Context) {
        try {
            ctx.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (_: Exception) { }
    }

    /** Most-used launchable packages in the last 7 days, most recent first. */
    fun topPackages(ctx: Context, limit: Int = 12): List<String> {
        if (!hasUsageAccess(ctx)) return emptyList()
        return try {
            val usm = ctx.getSystemService(UsageStatsManager::class.java) ?: return emptyList()
            val now = System.currentTimeMillis()
            val stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY, now - 7L * 24 * 3600 * 1000, now
            ) ?: return emptyList()
            val launchable = listApps(ctx).map { it.packageName }.toSet()
            stats.filter { it.packageName in launchable && it.totalTimeInForeground > 0 }
                .sortedByDescending { it.lastTimeUsed }
                .take(limit)
                .map { it.packageName }
        } catch (_: Exception) { emptyList() }
    }

    fun topPackagesJson(ctx: Context, limit: Int = 12): String {
        val arr = JSONArray()
        for (p in topPackages(ctx, limit)) arr.put(p)
        return arr.toString()
    }

    /* ── contacts (NOVA FIND → people), needs READ_CONTACTS ──── */

    fun contactsJson(ctx: Context, query: String, limit: Int = 8): String {
        val arr = JSONArray()
        try {
            if (androidx.core.content.ContextCompat.checkSelfPermission(
                    ctx, android.Manifest.permission.READ_CONTACTS
                ) != PackageManager.PERMISSION_GRANTED
            ) return arr.toString()
            val resolver = ctx.contentResolver
            val uri = android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            val cursor = resolver.query(
                uri,
                arrayOf(
                    android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER,
                ),
                "${android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
                arrayOf("%$query%"),
                "${android.provider.ContactsContract.CommonDataKinds.Phone.TIMES_CONTACTED} DESC",
            ) ?: return arr.toString()
            cursor.use {
                val nameIx = it.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numIx = it.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
                var n = 0
                val seen = HashSet<String>()
                while (it.moveToNext() && n < limit) {
                    val name = if (nameIx >= 0) it.getString(nameIx).orEmpty() else ""
                    val num = if (numIx >= 0) it.getString(numIx).orEmpty() else ""
                    if (name.isBlank() || !seen.add(name)) continue
                    arr.put(JSONObject().put("n", name).put("p", num))
                    n++
                }
            }
        } catch (_: Exception) { }
        return arr.toString()
    }

    fun dial(ctx: Context, number: String): Boolean = try {
        ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        true
    } catch (_: Exception) { false }
}
