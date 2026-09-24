package os.nova.tokens

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * NOVA TOKENS — Design Token System
 * Single source of truth per spec #62
 * Colors, Typography, Spacing, Radius, Elevation, Glass, Motion, Haptics, Sound
 */

object NovaColors {
    object Dark {
        val bg = Color(0xFF06070A)
        val bg2 = Color(0xFF0B0D13)
        val surface = Color(0xFF0E1117)
        val elevated = Color(0xFF171A22)
        val line = Color(0x14F4F6FA)
        val lineStrong = Color(0x29F4F6FA)
        val text = Color(0xFFF4F6FA)
        val text2 = Color(0xFF8B93A1)
        val text3 = Color(0xFF5A6070)
        val scrim = Color(0x8C040508)
        
        object Glass {
            val clear = Color(0x52171A22)
            val soft = Color(0x8F171A22)
            val solid = Color(0xD1171A22)
            val ultra = Color(0xA3171A22)
        }
    }
    
    object Light {
        val bg = Color(0xFFF4F6F8)
        val bg2 = Color(0xFFEDE9E2)
        val surface = Color(0xFFFFFFFF)
        val elevated = Color(0xFFFFFFFF)
        val line = Color(0x14101217)
        val lineStrong = Color(0x29101217)
        val text = Color(0xFF101217)
        val text2 = Color(0xFF5B6273)
        val text3 = Color(0xFF98907F)
        val scrim = Color(0x521E1810)
        
        object Glass {
            val clear = Color(0x6BFFFFFF)
            val soft = Color(0xADFFFFFF)
            val solid = Color(0xE0FFFFFF)
            val ultra = Color(0xB8FFFFFF)
        }
    }
    
    object Accent {
        val violet = Color(0xFF6C5CE7)
        val violet2 = Color(0xFF22D3EE)
        val aurora = Color(0xFF4ADE80)
        val aurora2 = Color(0xFFA78BFA)
        val orbit = Color(0xFFF5A524)
        val liquid = Color(0xFF22D3EE)
        val liquid2 = Color(0xFFFF6B9A)
        val neon = Color(0xFFFF3D81)
        val neon2 = Color(0xFF00E5FF)
    }
    
    object Semantic {
        val bloom = Color(0xFFFF6B9A)
        val mint = Color(0xFF34D399)
        val amber = Color(0xFFF5A524)
        val coral = Color(0xFFFF5C5C)
        val ice = Color(0xFF7DD3FC)
    }
}

object NovaSpacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp
    val xxl = 24.dp
    val xxxl = 32.dp
    val huge = 48.dp
    
    object Tokens {
        val small = 8.dp
        val medium = 16.dp
        val large = 24.dp
        val xlarge = 32.dp
    }
}

object NovaRadius {
    val chip = 10.dp
    val card = 22.dp
    val window = 28.dp
    val panel = 32.dp
    val orb = 999.dp
    
    object Tokens {
        val card = 22.dp
        val window = 28.dp
        val panel = 32.dp
        val full = 9999.dp
    }
}

object NovaTypography {
    object Scale {
        data class TextStyle(val size: Int, val weight: Int, val tracking: Float, val line: Float)
        val display = TextStyle(40, 600, -0.5f, 1.1f)
        val title = TextStyle(26, 600, -0.3f, 1.2f)
        val heading = TextStyle(19, 600, 0f, 1.35f)
        val body = TextStyle(16, 400, 0f, 1.7f)
        val label = TextStyle(14, 500, 0.1f, 1.5f)
        val caption = TextStyle(12, 500, 0.4f, 1.4f)
    }
}

object NovaGlassTokens {
    data class GlassLevel(val blur: Int, val opacity: Float, val edge: Float, val glow: Float, val shadow: Float)
    
    val clear = GlassLevel(8, 0.32f, 0.08f, 0.04f, 0.15f)
    val soft = GlassLevel(14, 0.56f, 0.12f, 0.08f, 0.22f)
    val solid = GlassLevel(4, 0.82f, 0.16f, 0.02f, 0.30f)
    val ultra = GlassLevel(22, 0.64f, 0.18f, 0.14f, 0.28f)
    
    val maxLiveLayers = 2
    val maxBlur = 22
}

object NovaMotionTokens {
    const val fast = 160
    const val normal = 320
    const val slow = 480
    const val long = 650
}

object NovaPerformanceTokens {
    data class PerformanceMode(val blur: Int, val particles: Boolean, val background: Boolean, val shadows: Boolean, val glass: String)
    
    val ultra = PerformanceMode(22, true, true, true, "ultra")
    val balanced = PerformanceMode(12, true, true, true, "soft")
    val performance = PerformanceMode(4, false, true, false, "solid")
    val battery = PerformanceMode(0, false, false, false, "solid")
    val reduced = PerformanceMode(0, false, false, false, "solid")
}
