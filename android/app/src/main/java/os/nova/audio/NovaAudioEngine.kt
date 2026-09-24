package os.nova.audio

/**
 * NOVA AUDIO ENGINE — per spec #58, #74
 * Sound Pack special for NOVA: short, quiet, clear, not annoying
 */

enum class SoundEvent { Open, Close, Success, Error, Tick, Defer, Orb, Sweep, Call, Notification, Charging, Unlock, Lock }

data class SoundConfig(
    val frequencies: List<Int>,
    val duration: Int,
    val type: String,
    val volume: Float
)

object NovaSoundPack {
    val open = SoundConfig(listOf(440, 660), 90, "sine", 0.3f)
    val close = SoundConfig(listOf(330, 220), 130, "sine", 0.25f)
    val success = SoundConfig(listOf(660, 880), 70, "sine", 0.35f)
    val error = SoundConfig(listOf(520, 300), 110, "saw", 0.3f)
    val tick = SoundConfig(listOf(0), 12, "noise", 0.15f)
    val charging = SoundConfig(listOf(440, 550, 660), 120, "sine", 0.3f)
    val unlock = SoundConfig(listOf(440, 660, 880), 150, "sine", 0.3f)
}

class NovaAudioEngine {
    private var enabled = true
    private var volume = 0.35f
    
    fun play(event: SoundEvent) {
        if (!enabled) return
        // In real implementation, would use AudioTrack / SoundPool
        // For now, log
    }
    
    fun open() = play(SoundEvent.Open)
    fun close() = play(SoundEvent.Close)
    fun success() = play(SoundEvent.Success)
    fun error() = play(SoundEvent.Error)
    fun tick() = play(SoundEvent.Tick)
    
    fun setEnabled(enabled: Boolean) { this.enabled = enabled }
    fun setVolume(volume: Float) { this.volume = volume.coerceIn(0f, 1f) }
    
    companion object {
        val instance = NovaAudioEngine()
    }
}
