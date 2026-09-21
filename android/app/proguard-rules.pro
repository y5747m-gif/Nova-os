# NOVA OS — only used for signed release builds (minifyEnabled = true)

# the JS bridge must survive obfuscation: the web layer calls these by name
-keepclassmembers class os.nova.launcher.NovaBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class os.nova.launcher.NovaBridge { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# keep entry points the platform instantiates by name
-keep class os.nova.launcher.MainActivity { *; }
-keep class os.nova.launcher.NovaApp { *; }
-keep class os.nova.launcher.NovaBootReceiver { *; }
-keep class os.nova.launcher.NovaUpdateWorker { *; }

# WorkManager instantiates workers reflectively
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.ListenableWorker

-dontwarn org.jetbrains.annotations.**
