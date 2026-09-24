package os.nova.shapes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * NOVA SHAPE ENGINE — per spec #10-11, #60
 * Shapes: Orb, Capsule, Prism, Ring, Crystal, Node, Arc, Ribbon
 * Interactive, not decoration — status, action, navigation
 */

sealed class NovaShape {
    abstract val size: Dp
    abstract val interactive: Boolean
    
    data class Orb(
        override val size: Dp = 64.dp,
        override val interactive: Boolean = true,
        val state: OrbState = OrbState.Idle,
        val glow: Boolean = true
    ) : NovaShape()
    
    data class Capsule(
        override val size: Dp = 48.dp,
        override val interactive: Boolean = true,
        val ratio: Float = 2.5f
    ) : NovaShape()
    
    data class Prism(
        override val size: Dp = 48.dp,
        override val interactive: Boolean = true,
        val sides: Int = 6
    ) : NovaShape()
    
    data class Ring(
        override val size: Dp = 48.dp,
        override val interactive: Boolean = true,
        val thickness: Dp = 3.dp,
        val progress: Float = 0f
    ) : NovaShape()
    
    data class Crystal(
        override val size: Dp = 48.dp,
        override val interactive: Boolean = true,
        val facets: Int = 8
    ) : NovaShape()
    
    data class Node(
        override val size: Dp = 12.dp,
        override val interactive: Boolean = true,
        val connected: Boolean = false
    ) : NovaShape()
    
    data class Arc(
        override val size: Dp = 96.dp,
        override val interactive: Boolean = true,
        val thickness: Dp = 4.dp,
        val angle: Float = 270f,
        val value: Float = 0.5f
    ) : NovaShape()
    
    data class Ribbon(
        override val size: Dp = 48.dp,
        override val interactive: Boolean = true,
        val width: Dp = 4.dp,
        val curve: Float = 0.5f
    ) : NovaShape()
}

enum class OrbState {
    Idle, Listening, Thinking, Processing, Success, Error;
    
    fun description(): String = when (this) {
        Idle -> "حركة تنفس بسيطة"
        Listening -> "يتوسع قليلاً"
        Thinking -> "حركة ضوئية داخلية"
        Processing -> "حلقة تدور ببطء"
        Success -> "يتحول إلى شكل مكتمل"
        Error -> "تغير بسيط في الشكل والحركة"
    }
}

object NovaShapeEngine {
    
    fun createShape(type: String, size: Dp = 48.dp): NovaShape = when (type.lowercase()) {
        "orb" -> NovaShape.Orb(size)
        "capsule" -> NovaShape.Capsule(size)
        "prism" -> NovaShape.Prism(size)
        "ring" -> NovaShape.Ring(size)
        "crystal" -> NovaShape.Crystal(size)
        "node" -> NovaShape.Node(size)
        "arc" -> NovaShape.Arc(size)
        "ribbon" -> NovaShape.Ribbon(size)
        else -> NovaShape.Orb(size)
    }
    
    // Usage mapping per spec #11
    fun shapeForFeature(feature: String): String = when (feature.lowercase()) {
        "wifi" -> "orb"
        "battery" -> "ring"
        "notifications" -> "node"
        "brightness" -> "arc"
        "activeapp" -> "crystal"
        "ai" -> "orb"
        "bluetooth" -> "orb"
        "volume" -> "arc"
        "airplane" -> "node"
        else -> "orb"
    }
}

@Composable
fun NovaOrb(
    state: OrbState = OrbState.Idle,
    size: Dp = 64.dp,
    color: Color = Color(0xFF6C5CE7),
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.9f),
                        color
                    )
                )
            )
            .border(1.dp, color.copy(alpha = 0.3f), CircleShape)
    ) {
        // Inner glow
        Box(
            modifier = Modifier
                .size(size * 0.6f)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color.White.copy(alpha = 0.8f),
                            Color.Transparent
                        )
                    )
                )
        )
    }
}

@Composable
fun NovaRing(
    progress: Float = 0.72f,
    size: Dp = 48.dp,
    thickness: Dp = 3.dp,
    color: Color = Color(0xFF6C5CE7),
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .border(thickness, color.copy(alpha = 0.3f), CircleShape)
    ) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .border(thickness, color, CircleShape)
        )
    }
}

@Composable
fun NovaCapsule(
    size: Dp = 48.dp,
    ratio: Float = 2.5f,
    color: Color = Color(0xFF6C5CE7),
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(width = size * ratio, height = size)
            .clip(RoundedCornerShape(50))
            .background(
                Brush.linearGradient(
                    colors = listOf(color, color.copy(alpha = 0.7f))
                )
            )
    )
}

@Composable
fun NovaCrystal(
    size: Dp = 48.dp,
    color: Color = Color(0xFF6C5CE7),
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.15f),
                        Color.White.copy(alpha = 0.05f)
                    )
                )
            )
            .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
    )
}
