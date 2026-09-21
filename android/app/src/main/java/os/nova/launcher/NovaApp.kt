package os.nova.launcher

import android.app.Application

class NovaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        NovaNotify.ensureChannels(this)
        // NOVA keeps itself up to date: one silent check every 12h (Wi-Fi or mobile)
        NovaUpdateWorker.schedule(this)
    }
}
