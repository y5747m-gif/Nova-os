# 11 — Performance & Optimization

> **ملخص عربي:** الأداء أهم من المؤثرات — كل حاجة قابلة للإيقاف، كل مكون له Lifecycle صحيح.

## 1. Core Principles (spec #3)

### Never

- Lag
- Frame Drops
- Memory Leaks
- ANR
- Excessive GPU/CPU
- Infinite animations
- Unnecessary background animations
- Permanent full-screen blur
- Many particles
- Many 3D objects
- Continuous re-render without reason

### Always

- Every animation stoppable/lightenable
- Every component correct Lifecycle
- Release resources when not needed

## 2. Frame Stability (spec #49)

### Targets

- 60 FPS baseline
- 90/120Hz where supported
- 0 dropped at 120Hz, <2 at 60Hz for open transition
- Time from intent to first frame ≤ 120ms perceived (transition starts on touch)

### Implementation

```kotlin
// Frame-rate independent — time/physics based, not frame count
fun advance(dt: Double): Boolean {
    // dt = actual delta time, not fixed 16ms
    integrate(state, target, config, dt)
}

// Use Choreographer for vsync
Choreographer.getInstance().postFrameCallback { frameTimeNanos ->
    val dt = (frameTimeNanos - lastFrameNanos) / 1e9
    motionClock.pulse(dt)
}
```

### Don't Assume Refresh Rate

```kotlin
// Query actual display refresh
val display = windowManager.defaultDisplay
val refreshRate = display.refreshRate // 60, 90, 120
```

## 3. Memory Management (spec #50)

### Rules

- Release unused resources
- No huge images in memory
- Proper image loading (Coil/Glide with size limits)
- Controlled caching (LruCache, max 10% RAM)
- No static Context references
- Monitor Lifecycle (ViewModel, DisposableEffect)
- No unnecessary Services

### Image Loading

```kotlin
// Bounded size, not full resolution
ImageRequest.Builder(context)
    .data(imageUri)
    .size(400, 400) // not 4000x4000
    .memoryCachePolicy(CachePolicy.ENABLED)
    .diskCachePolicy(CachePolicy.ENABLED)
    .build()

// Release when not visible
DisposableEffect(Unit) {
    onDispose {
        imageLoader.memoryCache?.clear()
    }
}
```

### Lifecycle

```kotlin
@Composable
fun NovaSurface() {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> pauseAnimations()
                Lifecycle.Event.ON_RESUME -> resumeAnimations()
                Lifecycle.Event.ON_DESTROY -> releaseResources()
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
}
```

## 4. Thermal Management (spec #51)

### Auto Downgrade

If thermal rises, NOVA auto-reduces:

- Blur
- Particles
- Background animation
- Complex transitions

Keeps:

- Navigation
- Touch response
- Basic UI

### Implementation

```kotlin
PowerManager.OnThermalStatusChangedListener { status ->
    when (status) {
        PowerManager.THERMAL_STATUS_LIGHT -> {
            // Reduce particles
            performanceManager.setMode(Performance)
        }
        PowerManager.THERMAL_STATUS_MODERATE -> {
            // Reduce blur, particles, background
            performanceManager.setMode(Performance)
            glassManager.setLevel(Solid)
        }
        PowerManager.THERMAL_STATUS_SEVERE,
        PowerManager.THERMAL_STATUS_CRITICAL -> {
            // Stop living background, all non-essential
            performanceManager.setMode(Battery)
            // Show subtle chip in CONTROL: thermal throttling
        }
    }
}
```

### User Honesty

Never lie to user — subtle status chip appears in CONTROL when thermal throttling active.

## 5. Battery Management (spec #52)

### No Permanent GPU

- Living Background stops when:
  - Screen off
  - App background
  - Battery Saver active
  - Thermal throttling

### Implementation

```kotlin
// Stop FX when not visible
override fun onPause() {
    fx?.pause()
    performanceManager.stopMonitoring()
}

override fun onResume() {
    if (!batterySaver && thermalState == Nominal) {
        fx?.resume()
        performanceManager.startMonitoring()
    }
}

// Battery saver listener
BatteryManager.ACTION_BATTERY_CHANGED -> {
    if (batterySaver) {
        performanceManager.setMode(Battery)
        fx?.pause()
    }
}
```

## 6. Glass Rendering Optimization (spec #9)

### Don't Blur Full Screen for Each Card

Use:

- Clipped surfaces (`contain: layout style paint`, `overflow: hidden`)
- Cached backgrounds (static snapshots)
- Reduced blur radius (8px instead of 22px on low-end)
- Static snapshots when appropriate
- GPU accelerated (`transform: translateZ(0)`, `will-change`)

Don't recalculate glass background every frame without reason.

### Implementation

```css
.nova-glass-card {
    contain: layout style paint;
    overflow: hidden;
    will-change: transform, opacity;
    transform: translateZ(0);
    backdrop-filter: blur(14px); /* gated to 2 layers */
}

body[data-performance="battery"] .nova-glass-card {
    backdrop-filter: none;
    background: var(--nv-surface);
}
```

```kotlin
// Track live blur layers
var liveBlurLayers = 0

fun applyGlass(el: View, level: GlassLevel) {
    if (liveBlurLayers >= 2 && level.blur > 0) {
        // Downgrade to solid, no blur
        el.background = solidColor
        return
    }
    
    if (level.blur > 0) {
        el.setRenderEffect(RenderEffect.createBlurEffect(level.blur, level.blur, Shader.TileMode.CLAMP))
        liveBlurLayers++
        el.addOnAttachStateChangeListener(object : OnAttachStateChangeListener {
            override fun onViewDetachedFromWindow(v: View) {
                liveBlurLayers--
            }
        })
    }
}
```

## 7. Motion Optimization

### Spring Physics

- Stiffness, damping, mass, velocity — not just duration
- Settle needs 2 consecutive quiet frames
- Snap exactly onto target when settled
- Velocity preserved on re-target (no visual jump)

### GPU-Only

Transforms, opacity, clip radius — never layout per frame.

```kotlin
// Good: GPU
Modifier.graphicsLayer {
    translationX = x
    scaleX = scale
    alpha = alpha
}

// Bad: layout
Modifier.offset { IntOffset(x.roundToInt(), y.roundToInt()) } // triggers layout
```

### Idle is Idle

All loops stop under settle threshold. No wallpaper animation when screen off or app fullscreen immersive.

```kotlin
class FrameClock {
    fun pulse(nowMs: Double) {
        if (subscribers.isEmpty()) {
            running = false
            return // stop loop
        }
        // ...
    }
}
```

## 8. Performance Modes (spec #48)

| Mode | Blur | Particles | Background | Shadows | Glass | FPS |
|------|------|-----------|------------|---------|-------|-----|
| Ultra | 22 | yes | yes | yes | ultra | 120 |
| Balanced | 12 | yes | yes | yes | soft | 60 |
| Performance | 4 | no | yes | no | solid | 60 |
| Battery | 0 | no | no | no | solid | 30 |
| Reduced | 0 | no | no | no | solid | 30 |

User chooses: Cinematic, Balanced, Fast, Minimal, Reduced Motion
System auto-chooses based on thermal, battery, memory, FPS, device tier.

## 9. Monitoring

### Metrics

- FPS
- Frame time
- Jank (frame > 16.6ms at 60Hz)
- CPU
- GPU
- RAM
- Battery
- Thermal state

### Debug Overlay (dev only)

```kotlin
if (BuildConfig.DEBUG && developerMode) {
    NovaDebugOverlay(
        fps = stats.fps,
        gpu = gpuLoad,
        cpu = cpuLoad,
        memory = memoryPressure,
        jank = worstFrame,
        glass = glassLevel,
        thermal = thermalState
    )
}
```

Not for end user — only developer mode.

## 10. Optimization Checklist

- [ ] All animations use NovaMotion engine (no hand-rolled rAF)
- [ ] No inline style.transition in surfaces
- [ ] Transforms are GPU (graphicsLayer, not layout)
- [ ] Blur gated to ≤2 live layers, ≤12px default, ≤22px max
- [ ] Living background pauses on battery saver, screen off, thermal
- [ ] Images bounded size, cached, released when not visible
- [ ] No static Context references
- [ ] Lifecycle correct: pause on pause, release on destroy
- [ ] No Services running without need
- [ ] Frame-rate independent (dt, not fixed 16ms)
- [ ] Supports 60/90/120Hz, doesn't assume
- [ ] Performance modes work: Ultra, Balanced, Performance, Battery, Reduced
- [ ] Adaptive glass: High→Ultra, Mid→Soft, Low→Solid
- [ ] Thermal downgrade: blur, particles, background reduced
- [ ] Battery saver: background stopped
- [ ] Reduced motion: critically damped, no blur/arcs
- [ ] Reduce transparency: glass → solid
- [ ] Debug overlay only in dev mode
- [ ] No memory leaks (20 open/close cycles <10MB growth)
- [ ] No ANR (all heavy work off main thread)
- [ ] Cold start < 120ms perceived

## 11. Battery Tests

```bash
# Measure drain
# 1 hour with NOVA vs 1 hour with default launcher
# Target: <2% extra drain

# Background
# NOVA in background, no Services running
# Assert: 0% CPU when idle
```

## 12. Thermal Tests

```bash
# Stress test: open/close apps rapidly for 5 minutes
# Assert: thermal state goes Fair → Serious → Critical → downgrades
# Assert: UI still responsive (navigation, touch)
# Assert: after cooling, returns to Balanced
```
