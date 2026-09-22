package os.nova.launcher

import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

/**
 * The APK lives on this repo's GitHub Releases (built by .github/workflows/apk.yml).
 * No accounts, no servers of our own — and if the network is down, NOVA simply
 * keeps running the version it has.
 */
object NovaUpdater {
    const val REPO = "y5747m-gif/Nova-os"

    data class ApkRelease(val name: String, val url: String, val tag: String, val size: Long)

    private const val API = "https://api.github.com/repos/$REPO/releases?per_page=10"
    private val VERSION_RE = Regex("""v?(\d+\.\d+\.\d+)""")

    fun latestApk(timeoutMs: Int = 8000): ApkRelease? = try {
        val connection = (URL(API).openConnection() as HttpURLConnection).apply {
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            requestMethod = "GET"
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "NOVA-OS/${BuildConfig.VERSION_NAME}")
        }
        connection.inputStream.bufferedReader().use { reader ->
            val releases = JSONArray(reader.readText())
            var fallback: ApkRelease? = null
            for (i in 0 until releases.length()) {
                val release = releases.getJSONObject(i)
                val assets = release.optJSONArray("assets") ?: continue
                for (j in 0 until assets.length()) {
                    val asset = assets.getJSONObject(j)
                    val name = asset.optString("name")
                    if (!name.endsWith(".apk", ignoreCase = true)) continue
                    val rel = ApkRelease(
                        name = name,
                        url = asset.optString("browser_download_url"),
                        tag = release.optString("tag_name"),
                        size = asset.optLong("size"),
                    )
                    // the versioned asset (nova-os-vX.Y.Z.apk) is the one the
                    // updater can reason about; «-latest» carries no version,
                    // so it is only a fallback — preferring it silently
                    // disabled every future update notification
                    if (VERSION_RE.containsMatchIn(name)) return@use rel
                    if (fallback == null) fallback = rel
                }
            }
            fallback
        }.also { connection.disconnect() }
    } catch (_: Throwable) {
        null
    }

    /** true only when the release asset is strictly NEWER than this build. */
    fun isNewer(release: ApkRelease): Boolean {
        val asset = versionOf(release)
        val theirs = asset.split('.').map { it.toIntOrNull() ?: 0 }
        val mine = BuildConfig.VERSION_NAME.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(theirs.size, mine.size)) {
            val t = theirs.getOrElse(i) { 0 }
            val m = mine.getOrElse(i) { 0 }
            if (t != m) return t > m
        }
        return false
    }

    /** «0.3.1» from an asset name like nova-os-v0.3.1.apk (falls back to the tag). */
    fun versionOf(release: ApkRelease): String =
        VERSION_RE.find(release.name)?.groupValues?.get(1) ?: release.tag
}
