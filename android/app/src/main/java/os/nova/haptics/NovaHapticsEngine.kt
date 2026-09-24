package os.nova.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * NOVA HAPTICS ENGINE — per spec #54, #58
 */

enum class HapticType(val duration: Long) {
    Open(8),
    Close(14),
    Tick(3),
    Snap(10),
    Success(20),
    Error(30),
    Orb(20),
    Selection(5),
    Impact(20)
}

class NovaHapticsEngine(private val context: Context) {
    
    private var enabled = true
    private var quietMode = false
    private var budgetUsed = 0
    private var windowStart = System.currentTimeMillis()
    private val maxPerMinute = 40
    private val cooldown = 120L
    private var lastVibration = 0L
    
    private val vibrator: Vibrator? by lazy {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        } catch (_: Exception) { null }
    }
    
    fun canVibrate(): Boolean {
        if (!enabled) return false
        if (quietMode) return false
        
        val now = System.currentTimeMillis()
        if (now - windowStart > 60000) {
            budgetUsed = 0
            windowStart = now
        }
        
        if (budgetUsed >= maxPerMinute) return false
        if (now - lastVibration < cooldown) return false
        
        return true
    }
    
    fun vibrate(duration: Long): Boolean {
        if (!canVibrate()) return false
        
        return try {
            val vib = vibrator ?: return false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(duration)
            }
            budgetUsed++
            lastVibration = System.currentTimeMillis()
            true
        } catch (_: Exception) { false }
    }
    
    fun play(type: HapticType): Boolean {
        return vibrate(type.duration)
    }
    
    fun open() = play(HapticType.Open)
    fun close() = play(HapticType.Close)
    fun tick() = play(HapticType.Tick)
    fun snap() = play(HapticType.Snap)
    fun success(): Boolean {
        // Double pulse
        vibrate(12)
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            vibrate(12)
        }, 60)
        return true
    }
    fun error() = play(HapticType.Error)
    fun orb(): Boolean {
        vibrate(10)
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            vibrate(10)
        }, 40)
        return true
    }
    
    fun setEnabled(enabled: Boolean) { this.enabled = enabled }
    fun setQuietMode(enabled: Boolean) { this.quietMode = enabled }
    
    fun getBudgetLeft(): Int {
        val now = System.currentTimeMillis()
        if (now - windowStart > 60000) return maxPerMinute
        return maxOf(0, maxPerMinute - budgetUsed)
    }
}
