package os.nova.settings

/**
 * NOVA SETTINGS — per spec #54-56, #58
 */

enum class SettingsSection { Appearance, Motion, Glass, Sound, Haptics, Gestures, Notifications, Privacy, Security, AI, Battery, Performance, Accessibility, System }

enum class MotionPreset { Cinematic, Balanced, Fast, Minimal, Reduced }
enum class GlassPreset { Clear, Soft, Solid }

data class NovaSettings(
    val appearance: AppearanceSettings = AppearanceSettings(),
    val motion: MotionSettings = MotionSettings(),
    val glass: GlassSettings = GlassSettings(),
    val sound: SoundSettings = SoundSettings(),
    val haptics: HapticsSettings = HapticsSettings(),
    val performance: PerformanceSettings = PerformanceSettings(),
    val accessibility: AccessibilitySettings = AccessibilitySettings()
)

data class AppearanceSettings(val mode: String = "dark", val accent: String = "violet")
data class MotionSettings(val profile: String = "balanced", val theme: String = "aurora")
data class GlassSettings(val level: String = "soft", val transparency: Float = 0.6f, val blur: Int = 12, val adaptive: Boolean = true)
data class SoundSettings(val enabled: Boolean = true, val volume: Float = 0.35f)
data class HapticsSettings(val enabled: Boolean = true, val intensity: Float = 0.7f)
data class PerformanceSettings(val mode: String = "balanced")
data class AccessibilitySettings(val reducedMotion: Boolean = false, val highContrast: Boolean = false, val largeText: Boolean = false, val reduceTransparency: Boolean = false)

class NovaSettingsManager {
    
    private var settings = NovaSettings()
    private val listeners = mutableSetOf<(String, String, Any) -> Unit>()
    
    fun get(): NovaSettings = settings.copy()
    
    fun set(section: String, key: String, value: Any) {
        // Simplified — in real would use DataStore
        when (section) {
            "appearance" -> {
                when (key) {
                    "mode" -> settings = settings.copy(appearance = settings.appearance.copy(mode = value as String))
                    "accent" -> settings = settings.copy(appearance = settings.appearance.copy(accent = value as String))
                }
            }
            "motion" -> {
                when (key) {
                    "profile" -> settings = settings.copy(motion = settings.motion.copy(profile = value as String))
                    "theme" -> settings = settings.copy(motion = settings.motion.copy(theme = value as String))
                }
            }
            "glass" -> {
                when (key) {
                    "level" -> settings = settings.copy(glass = settings.glass.copy(level = value as String))
                    "adaptive" -> settings = settings.copy(glass = settings.glass.copy(adaptive = value as Boolean))
                }
            }
            "performance" -> {
                when (key) {
                    "mode" -> settings = settings.copy(performance = settings.performance.copy(mode = value as String))
                }
            }
        }
        
        for (listener in listeners.toList()) {
            try { listener(section, key, value) } catch (_: Exception) {}
        }
    }
    
    fun onChange(listener: (String, String, Any) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }
    
    companion object {
        val instance = NovaSettingsManager()
    }
}
