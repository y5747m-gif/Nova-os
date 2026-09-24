package os.nova.glass

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import os.nova.tokens.NovaGlassTokens
import os.nova.tokens.NovaRadius
import os.nova.performance.NovaPerformanceManager

/**
 * NOVA GLASS ENGINE — per spec #6-9, #59
 * Four types: Clear, Soft, Solid, Ultra + Adaptive Glass
 * Performance-aware, cached, GPU-accelerated
 */

enum class GlassLevel {
    Clear, Soft, Solid, Ultra;
    
    fun toTokens(): NovaGlassTokens.GlassLevel = when (this) {
        Clear -> NovaGlassTokens.clear
        Soft -> NovaGlassTokens.soft
        Solid -> NovaGlassTokens.solid
        Ultra -> NovaGlassTokens.ultra
    }
    
    fun blur(): Dp = toTokens().blur.dp
    fun opacity(): Float = toTokens().opacity
}

object NovaGlassEngine {
    
    fun selectAdaptiveLevel(deviceTier: String, performanceMode: String, thermalState: String, memoryPressure: Float, fps: Int): GlassLevel {
        if (performanceMode == "battery" || performanceMode == "reduced") return GlassLevel.Solid
        if (thermalState == "critical" || thermalState == "severe") return GlassLevel.Solid
        if (memoryPressure > 0.85f) return GlassLevel.Solid
        if (fps < 45) return GlassLevel.Solid
        if (deviceTier == "low") return GlassLevel.Solid
        if (deviceTier == "mid") return GlassLevel.Soft
        return if (deviceTier == "high") GlassLevel.Ultra else GlassLevel.Soft
    }
    
    fun shouldUseBlur(performanceMode: String, liveLayers: Int): Boolean {
        if (liveLayers >= NovaGlassTokens.maxLiveLayers) return false
        val mode = when (performanceMode) {
            "ultra" -> NovaPerformanceTokens.ultra
            "balanced" -> NovaPerformanceTokens.balanced
            "performance" -> NovaPerformanceTokens.performance
            "battery" -> NovaPerformanceTokens.battery
            else -> NovaPerformanceTokens.reduced
        }
        return mode.blur > 0
    }
}

object NovaPerformanceTokens {
    data class PerformanceMode(val blur: Int, val particles: Boolean, val background: Boolean, val shadows: Boolean, val glass: String)
    val ultra = PerformanceMode(22, true, true, true, "ultra")
    val balanced = PerformanceMode(12, true, true, true, "soft")
    val performance = PerformanceMode(4, false, true, false, "solid")
    val battery = PerformanceMode(0, false, false, false, "solid")
    val reduced = PerformanceMode(0, false, false, false, "solid")
}

/**
 * Compose modifiers for glass surfaces — unified API per spec #59
 */

fun Modifier.novaGlassSurface(
    level: GlassLevel = GlassLevel.Soft,
    depth: Int = 1,
    radius: Dp = NovaRadius.card,
    performanceManager: NovaPerformanceManager? = null
): Modifier {
    val tokens = level.toTokens()
    val useBlur = performanceManager?.shouldUseBlur() ?: (level != GlassLevel.Solid)
    val liveLayers = 0 // Would track actual live layers
    
    return this
        .clip(RoundedCornerShape(radius))
        .background(Color.Black.copy(alpha = tokens.opacity * 0.3f))
        .border(1.dp, Color.White.copy(alpha = tokens.edge), RoundedCornerShape(radius))
        .then(if (useBlur && tokens.blur > 0) Modifier.blur(tokens.blur.dp) else Modifier)
}

@Composable
fun Modifier.novaGlassCard(
    level: GlassLevel = GlassLevel.Soft,
    performanceManager: NovaPerformanceManager? = null
): Modifier = novaGlassSurface(level, 1, NovaRadius.card, performanceManager)

@Composable
fun Modifier.novaGlassPanel(
    level: GlassLevel = GlassLevel.Soft,
    performanceManager: NovaPerformanceManager? = null
): Modifier = novaGlassSurface(level, 2, NovaRadius.panel, performanceManager)

@Composable
fun Modifier.novaGlassButton(
    level: GlassLevel = GlassLevel.Soft,
    performanceManager: NovaPerformanceManager? = null
): Modifier = novaGlassSurface(level, 0, NovaRadius.orb, performanceManager)

@Composable
fun Modifier.novaGlassDialog(
    level: GlassLevel = GlassLevel.Solid,
    performanceManager: NovaPerformanceManager? = null
): Modifier = novaGlassSurface(level, 3, NovaRadius.window, performanceManager)

@Composable
fun Modifier.novaGlassOrb(
    level: GlassLevel = GlassLevel.Ultra,
    performanceManager: NovaPerformanceManager? = null
): Modifier = novaGlassSurface(level, 1, NovaRadius.orb, performanceManager)

/**
 * Glass rendering optimization: cached backgrounds, clipped surfaces
 */
object GlassRendering {
    private val backgroundCache = mutableMapOf<String, Any>()
    var cacheEnabled = true
    
    fun enableCache(enabled: Boolean) {
        cacheEnabled = enabled
        if (!enabled) backgroundCache.clear()
    }
    
    fun getCachedBackground(key: String): Any? {
        return if (cacheEnabled) backgroundCache[key] else null
    }
    
    fun cacheBackground(key: String, background: Any) {
        if (cacheEnabled) {
            backgroundCache[key] = background
        }
    }
}
