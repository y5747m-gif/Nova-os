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
            var found: ApkRelease? = null
            for (i in 0 until releases.length()) {
                val release = releases.getJSONObject(i)
                val assets = release.optJSONArray("assets") ?: continue
                for (j in 0 until assets.length()) {
                    val asset = assets.getJSONObject(j)
                    val name = asset.optString("name")
                    if (name.endsWith(".apk", ignoreCase = true)) {
                        found = ApkRelease(
                            name = name,
                            url = asset.optString("browser_download_url"),
                            tag = release.optString("tag_name"),
                            size = asset.optLong("size"),
                        )
                        break
                    }
                }
                if (found != null) break
            }
            found
        }.also { connection.disconnect() }
    } catch (_: Throwable) {
        null
    }

    /** true when the release asset isn't the version we're already running. */
    fun isNewer(release: ApkRelease): Boolean {
        val assetVersion = Regex("""v?(\d+\.\d+\.\d+)""").find(release.name)?.groupValues?.get(1)
        return assetVersion != null && assetVersion != BuildConfig.VERSION_NAME
    }
}
