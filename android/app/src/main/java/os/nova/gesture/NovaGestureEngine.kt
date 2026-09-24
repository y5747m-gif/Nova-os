package os.nova.gesture

/**
 * NOVA GESTURE ENGINE — per spec #23
 * Swipe, Drag, Long Press, Pinch, Edge Swipe, Pull, Hold, Release
 * Gesture-driven, not just trigger
 */

enum class GestureType { Swipe, Drag, LongPress, Pinch, EdgeSwipe, Pull, Hold, Release }
enum class GestureZone { Bottom, Top, Left, Right, Corner, Surface, Center }

data class GestureEvent(
    val id: String,
    val x: Float,
    val y: Float,
    val dx: Float,
    val dy: Float,
    val velocityX: Float,
    val velocityY: Float,
    val velocity: Float,
    val progress: Float,
    val commit: Boolean,
    val zone: GestureZone,
    val type: GestureType?,
    val pointers: Int
)

class NovaGestureEngine {
    
    private val config = GestureConfig()
    
    data class GestureConfig(
        val swipeThreshold: Float = 60f,
        val longPressDuration: Long = 550,
        val pinchThreshold: Float = 10f,
        val edgeWidth: Float = 24f,
        val cornerSize: Float = 80f,
        val velocityThreshold: Float = 700f
    )
    
    fun getZone(x: Float, y: Float, width: Float, height: Float): GestureZone {
        val edgeW = config.edgeWidth
        val cornerS = config.cornerSize
        
        // Corners
        if ((x < cornerS && y < cornerS) ||
            (x > width - cornerS && y < cornerS) ||
            (x < cornerS && y > height - cornerS) ||
            (x > width - cornerS && y > height - cornerS)) {
            return GestureZone.Corner
        }
        
        if (x < edgeW) return GestureZone.Left
        if (x > width - edgeW) return GestureZone.Right
        if (y < edgeW) return GestureZone.Top
        if (y > height - edgeW) return GestureZone.Bottom
        
        val centerMargin = 0.3f
        val cx = width * centerMargin
        val cy = height * centerMargin
        if (x > cx && x < width - cx && y > cy && y < height - cy) {
            return GestureZone.Center
        }
        
        return GestureZone.Surface
    }
    
    fun calculateProgress(zone: GestureZone, dx: Float, dy: Float, width: Float, height: Float): Float {
        return when (zone) {
            GestureZone.Bottom -> (-dy / (height * 0.5f)).coerceIn(0f, 1f)
            GestureZone.Top -> (dy / (height * 0.42f)).coerceIn(0f, 1f)
            GestureZone.Right -> (-dx / (width * 0.62f)).coerceIn(0f, 1f)
            GestureZone.Left -> (dx / (width * 0.62f)).coerceIn(0f, 1f)
            else -> kotlin.math.hypot(dx, dy) / 200f
        }.coerceIn(0f, 1f)
    }
    
    companion object {
        val instance = NovaGestureEngine()
    }
}
