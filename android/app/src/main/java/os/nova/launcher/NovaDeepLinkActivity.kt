package os.nova.launcher

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * `nova://…` links (from shortcuts, FLOW taps and update notes) land here and
 * are forwarded into the running NOVA shell as a hash route.
 */
class NovaDeepLinkActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val data = intent?.data
        val route = buildString {
            if (data?.host != null) append(data.host)
            if (data?.path != null) append(data.path)
            if (data?.encodedQuery != null) append("?").append(data.encodedQuery)
        }
        startActivity(Intent(this, MainActivity::class.java).apply {
            action = MainActivity.ACTION_DEEP_LINK
            putExtra(MainActivity.EXTRA_ROUTE, route)
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        })
        finish()
    }
}
