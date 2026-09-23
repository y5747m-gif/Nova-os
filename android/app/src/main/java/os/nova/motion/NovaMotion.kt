package os.nova.motion

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/*
 * NOVA MOTION — the engine API (docs/02 §9).
 * The Kotlin port of `prototype/src/motion/motion.js` + `ticker.js`.
 *
 * The only way to animate inside NOVA surfaces: springs for anything
 * spatial, [NovaMotionConfig.duration] only for non-spatial fallbacks (M4).
 * One [FrameClock] drives every spring — loops stop when nothing animates
 * ("idle is idle"). Drive it from the UI thread / Choreographer; everything
 * here is single-threaded by contract.
 */

/* ── primitives ───────────────────────────────────────────────── */

fun clamp(v: Double, a: Double = 0.0, b: Double = 1.0): Double = max(a, min(b, v))

fun lerp(a: Double, b: Double, t: Double): Double = a + (b - a) * t

/** Engine-internal easing for progress *mapping* (panel/orbital) — never authored in surfaces. */
fun easeOut(t: Double): Double {
    val c = clamp(t)
    val inv = 1.0 - c
    return 1.0 - inv * inv * inv
}

/**
 * Release velocity, capped by the motion contract (docs/02 §3):
 * a flick may add energy, but it may never push the spring past the
 * 6 % overshoot budget. `velocity` is in normalised units per second,
 * already pointing at the target.
 */
fun capReleaseVelocity(from: Double, to: Double, cfg: NovaSpring, velocity: Double): Double {
    val omega = kotlin.math.sqrt(cfg.stiffness / cfg.mass)      // natural frequency
    val remaining = max(0.12, abs(to - from))                   // units left to travel
    val cap = 0.32 * omega * remaining
    return clamp(velocity, -cap, cap)
}

/* ── frame ticker (ports ticker.js) ───────────────────────────── */

/**
 * One clock for the whole system. Subscribers get `(dt seconds, now ms)`;
 * the loop stops itself when the last subscriber leaves, and FPS / worst
 * frame accounting lives in [stats] (docs/02 §10 "idle is idle").
 */
class FrameClock(private val nowMs: () -> Double) {

    class Stats {
        var fps: Int = 0
        var frameCount: Int = 0
        var worstFrame: Double = 0.0
        var active: Int = 0
        var lastTransition: String = "—"
    }

    val stats = Stats()

    private val subscribers = LinkedHashSet<(Double, Double) -> Unit>()
    private var running = false
    private var last = 0.0
    private var fpsWindow = 0.0
    private var fpsFrames = 0

    /** Subscribe a per-frame callback. Returns an unsubscribe function. */
    fun onFrame(fn: (dt: Double, nowMs: Double) -> Unit): () -> Unit {
        subscribers.add(fn)
        if (!running) {
            running = true
            last = nowMs()
        }
        return { subscribers.remove(fn) }
    }

    /** One tick — call this from Choreographer / vsync with `System.nanoTime()` ms. */
    fun pulse(nowMs: Double) {
        if (!running) return
        val dt = min(nowMs - last, 64.0) / 1000.0
        last = nowMs
        stats.frameCount++
        stats.worstFrame = max(stats.worstFrame, dt * 1000.0)

        fpsWindow += dt
        fpsFrames++
        if (fpsWindow >= 0.5) {
            stats.fps = NovaMotionConfig.jsRound(fpsFrames / fpsWindow).toInt()
            fpsWindow = 0.0
            fpsFrames = 0
            stats.worstFrame = max(0.0, stats.worstFrame - 4.0)
        }

        for (fn in subscribers.toList()) fn(dt, nowMs)
        stats.active = subscribers.size

        if (subscribers.isEmpty()) {
            running = false
        }
    }

    val isRunning: Boolean get() = running
}

/* ── the spring handle (ports springs.js `spring()`) ──────────── */

/**
 * An interruptible spring animation (M6): [retarget] preserves velocity,
 * settle needs two consecutive quiet frames, then it snaps exactly onto
 * the target and calls [onDone] once. Either advance it manually or pass
 * a [FrameClock] and it drives itself.
 */
class SpringAnimation(
    from: Double = 0.0,
    to: Double = 0.0,
    velocity: Double = 0.0,
    private val config: NovaSpring = Springs.SOFT,
    travel: Double? = null,
    private val onUpdate: ((Double, Double) -> Unit)? = null,
    private val onDone: ((Double) -> Unit)? = null,
    clock: FrameClock? = null,
) {
    private val state = SpringState(from, velocity)
    private var target = to
    private var stopped = false
    private var settledFrames = 0
    private var thresholds = settleThresholds(travel ?: (to - from))
    private var detach: (() -> Unit)? = null

    init {
        if (clock != null) {
            detach = clock.onFrame { dt, _ -> advance(dt) }
        }
    }

    val value: Double get() = state.x
    val velocity: Double get() = state.v
    val done: Boolean get() = stopped

    /** Step the spring by `dt` seconds; returns true while still animating. */
    fun advance(dt: Double): Boolean {
        if (stopped) return false
        integrate(state, target, config, dt)
        if (isSettled(state, target, thresholds.settleX, thresholds.settleV)) {
            settledFrames++
            if (settledFrames >= 2) {
                state.x = target
                state.v = 0.0
                stop()
                onUpdate?.invoke(state.x, 0.0)
                onDone?.invoke(state.x)
                return false
            }
        } else {
            settledFrames = 0
        }
        onUpdate?.invoke(state.x, state.v)
        return !stopped
    }

    /** Re-target mid-flight without a visual jump — velocity is preserved (M6). */
    fun retarget(next: Double, vel: Double? = null) {
        thresholds = settleThresholds(abs(next - state.x))
        target = next
        if (vel != null) state.v = vel
        settledFrames = 0
    }

    fun stop() {
        if (stopped) return
        stopped = true
        detach?.invoke()
        detach = null
    }
}

/* ── morph — the continuity primitive (M3) ────────────────────── */

/** A rect in screen/surface space (engine units = px). */
data class NovaRect(val x: Double, val y: Double, val w: Double, val h: Double)

/** What to paint for a given morph progress value — one transform, no swap. */
data class MorphFrame(
    val tx: Double,
    val ty: Double,
    val sx: Double,
    val sy: Double,
    val radius: Double,
    val blurPx: Double,
    val opacity: Double,
)

/**
 * Geometry of a card → app morph, computed once at creation (config is
 * snapshotted like the JS engine does): source offset, start scale, arc
 * bend, blur budget. [apply] is pure — the finger or the spring feeds it.
 */
class MorphPlan private constructor(
    private val dx: Double,
    private val dy: Double,
    private val sxc: Double,
    private val syc: Double,
    private val bend: Double,
    private val nx: Double,
    private val ny: Double,
    private val blurBudget: Double,
    private val radiusFrom: Double,
    private val radiusTo: Double,
    private val fade: Double,
) {
    fun apply(v: Double): MorphFrame {
        val vv = clamp(v)
        val sx = lerp(sxc, 1.0, vv)
        val sy = lerp(syc, 1.0, vv)
        val bow = sin(vv * kotlin.math.PI) * bend
        val tx = dx * (1.0 - vv) + nx * bow
        val ty = dy * (1.0 - vv) + ny * bow
        val radius = lerp(radiusFrom, radiusTo, vv) / max(0.2, (sx + sy) / 2.0)
        val b = blurBudget * (1.0 - vv)
        val opacity = if (fade > 0.0) clamp(1.0 - (1.0 - vv) * fade) else 1.0
        return MorphFrame(tx, ty, sx, sy, radius, b, opacity)
    }

    companion object {
        /**
         * Snapshot the geometry + current motion config. `arc` / `blur` /
         * `fade` are extra effects; profile & theme decide whether they
         * are honoured (arcs off → flat slide, blur budget 0 → no blur).
         */
        fun plan(
            from: NovaRect,
            to: NovaRect,
            radiusFrom: Double = 22.0,
            radiusTo: Double = 28.0,
            arc: Double = 0.0,
            blur: Double = 0.0,
            fade: Double = 0.0,
        ): MorphPlan {
            val dx = (from.x + from.w / 2.0) - (to.x + to.w / 2.0)
            val dy = (from.y + from.h / 2.0) - (to.y + to.h / 2.0)
            val sx0 = from.w / to.w
            val sy0 = from.h / to.h
            val cap = NovaMotionConfig.scaleCap()
            // Reduced Motion: never scale below (1 - cap) — position + fade instead.
            val sxc = max(sx0, 1.0 - cap * 0.9)
            val syc = max(sy0, 1.0 - cap * 0.9)
            val dist = hypot(dx, dy).let { if (it == 0.0) 1.0 else it }
            val curved = if (NovaMotionConfig.usesArcs()) arc else 0.0
            val bend = curved * min(dist, 560.0) * 0.22
            val nx = -dy / dist
            val ny = dx / dist
            val blurBudget = if (NovaMotionConfig.blurPx() > 0) blur else 0.0
            return MorphPlan(dx, dy, sxc, syc, bend, nx, ny, blurBudget, radiusFrom, radiusTo, fade)
        }
    }
}

/**
 * Gesture-controlled morph handle: [set] while the finger owns progress
 * (M1), [release] hands it to physics seeded with release velocity (M2).
 */
class MorphHandle(
    private val plan: MorphPlan,
    private val from: NovaRect,
    private val to: NovaRect,
    private val springName: String = "SOFT",
    private val travel: Double = 1.0,
    private val onProgress: ((Double) -> Unit)? = null,
    private val onDone: ((String, Double) -> Unit)? = null,
    private val clock: FrameClock = NovaMotion.clock,
) {
    var progress: Double = 0.0
        private set

    private var anim: SpringAnimation? = null
    private var finished = false

    init {
        apply(0.0)
    }

    private fun apply(v: Double) {
        progress = clamp(v)
        plan.apply(progress)
        onProgress?.invoke(progress)
    }

    /** Gesture-driven: the finger owns this value (M1). */
    fun set(v: Double) {
        anim?.stop()
        anim = null
        apply(v)
    }

    /** Release hands over to physics, seeded with the release velocity (M2). */
    fun release(dir: String = "commit", velocity: Double = 0.0) {
        if (finished) return
        val commit = dir == "commit"
        val target = if (commit) 1.0 else 0.0
        val cfg = NovaMotionConfig.springConfig(springName)
        val raw = (velocity / max(1.0, travel)) * (if (commit) 1.0 else -1.0)
        val vUnits = capReleaseVelocity(progress, target, cfg, raw)
        anim = SpringAnimation(
            from = progress,
            to = target,
            velocity = vUnits,
            config = NovaMotionConfig.springConfig(springName),
            onUpdate = { v, _ -> apply(v) },
            onDone = { v ->
                finished = true
                onDone?.invoke(if (clamp(v) > 0.5) "commit" else "cancel", progress)
            },
            clock = clock,
        )
    }

    fun snap(to: Double) {
        anim?.stop()
        anim = null
        finished = false
        release(if (to >= 0.5) "commit" else "cancel", 0.0)
    }

    fun stop() {
        anim?.stop()
        anim = null
    }

    val isAnimating: Boolean get() = anim?.done == false

    /** Exposed for surfaces that re-plan geometry (rotation etc.). */
    val source: NovaRect get() = from
    val destination: NovaRect get() = to
}

/* ── orbital — elements travel on an arc around a centre ──────── */

/** One item's orbital layout for a progress value. */
data class OrbitalItemState(val x: Double, val y: Double, val scale: Double, val alpha: Double, val p: Double)

/**
 * CORE / CONTROL / home ring: items sweep in from the hub along an arc,
 * staggered, layout derived from a single progress value (timer-free).
 */
class OrbitalMotion<T>(
    private val items: List<T>,
    private val centerX: Double,
    private val centerY: Double,
    private val radius: Double,
    private val angleOf: (T, Int) -> Double,
    private val staggerMs: Double = 40.0,
    private val arc: Double = 1.0,
    private val clock: FrameClock = NovaMotion.clock,
    private val onItem: (item: T, index: Int, state: OrbitalItemState) -> Unit,
    private val onProgress: ((Double) -> Unit)? = null,
) {
    private val n = items.size
    private val totalStagger = (n - 1) * staggerMs
    private val span = totalStagger + 320.0 // ms of nominal travel
    private var p = 0.0
    private var anim: SpringAnimation? = null

    init {
        layout(0.0)
    }

    fun layout(v: Double) {
        val progress = clamp(v)
        items.forEachIndexed { i, item ->
            val start = (i * staggerMs) / span
            val width = 1.0 - totalStagger / span
            val ip = clamp((progress - start) / width)
            val eased = if (NovaMotionConfig.usesArcs()) ip else easeOut(ip)
            val targetAngle = angleOf(item, i)
            // arc: items sweep in from the hub, rotated by the theme's arc bias
            val angle = targetAngle + (1.0 - eased) * NovaMotionConfig.arcBias() * arc * 0.9
            val r = lerp(radius * 0.28, radius, eased)
            val x = centerX + cos(angle) * r
            val y = centerY + sin(angle) * r
            val scale = lerp(0.72, 1.0, eased)
            val alpha = lerp(0.0, 1.0, clamp(eased * 1.35))
            onItem(item, i, OrbitalItemState(x, y, scale, alpha, eased))
        }
        onProgress?.invoke(progress)
    }

    fun set(v: Double) {
        anim?.stop()
        anim = null
        p = clamp(v)
        layout(p)
    }

    fun release(dir: String = "commit", velocity: Double = 0.0) {
        val commit = dir == "commit"
        val target = if (commit) 1.0 else 0.0
        val cfg = NovaMotionConfig.springConfig("theme")
        anim = SpringAnimation(
            from = p,
            to = target,
            velocity = capReleaseVelocity(p, target, cfg, (velocity / 420.0) * (if (commit) 1.0 else -1.0)),
            config = cfg,
            onUpdate = { v, _ -> p = v; layout(v) },
            clock = clock,
        )
    }

    val progress: Double get() = p
}

/* ── cascade — one spring, many siblings (stagger, M4) ────────── */

/**
 * A single 0→1 progress fans out over `items` with per-item stagger
 * offsets. Timer-free: everything derives from the progress value, so
 * the cascade is scrubbable and always interruptible.
 */
class CascadeMotion<T>(
    items: List<T>,
    private val staggerMs: Double = 40.0,
    private val span: Double = 460.0,
    private val springName: String = "SOFT",
    from: Double = 0.0,
    private val clock: FrameClock = NovaMotion.clock,
    private val onItem: (item: T, index: Int, itemProgress: Double, progress: Double) -> Unit,
    private val onProgress: ((Double) -> Unit)? = null,
    private val onDone: ((String, Double) -> Unit)? = null,
) {
    private val list: List<T> = items.toList()
    private val totalStagger = max(0.0, (list.size - 1) * staggerMs)
    private val width = max(80.0, span - totalStagger)
    private var p = clamp(from)
    private var anim: SpringAnimation? = null
    private var finished = false

    init {
        layout(p)
    }

    private fun layout(v: Double) {
        val ms = clamp(v) * span
        list.forEachIndexed { i, item ->
            val ip = easeOut(clamp((ms - i * staggerMs) / width))
            onItem(item, i, ip, clamp(v))
        }
        onProgress?.invoke(clamp(v))
    }

    val progress: Double get() = p

    fun set(v: Double) {
        anim?.stop()
        anim = null
        finished = false
        p = clamp(v)
        layout(p)
    }

    fun release(dir: String = "commit", velocity: Double = 0.0) {
        if (finished && ((dir == "commit" && p >= 1.0) || (dir == "cancel" && p <= 0.0))) return
        finished = false
        val commit = dir == "commit"
        val target = if (commit) 1.0 else 0.0
        val cfg = NovaMotionConfig.springConfig(springName)
        anim = SpringAnimation(
            from = p,
            to = target,
            velocity = capReleaseVelocity(p, target, cfg, (velocity / 700.0) * (if (commit) 1.0 else -1.0)),
            config = cfg,
            onUpdate = { v, _ -> p = v; layout(v) },
            onDone = { v ->
                finished = true
                onDone?.invoke(if (clamp(v) > 0.5) "commit" else "cancel", p)
            },
            clock = clock,
        )
    }
}

/* ── panel — bottom / top sheets on the same progress ─────────── */

data class PanelFrame(val ty: Double, val scale: Double, val opacity: Double, val interactive: Boolean)

/** CORE / FLOW sheets: position is finger-owned, physics only on release. */
class PanelMotion(
    private val from: String = "bottom",
    private val distance: Double = 620.0,
    private val springName: String = "SOFT",
    private val clock: FrameClock = NovaMotion.clock,
    private val onProgress: ((Double) -> Unit)? = null,
) {
    private val sign = if (from == "bottom") 1.0 else -1.0
    private var p = 0.0
    private var anim: SpringAnimation? = null

    val progress: Double get() = p
    val origin: String get() = from

    fun apply(v: Double): PanelFrame {
        p = clamp(v)
        val e = easeOut(p)
        val frame = PanelFrame(
            ty = sign * distance * (1.0 - e),
            scale = 0.94 + 0.06 * e,
            opacity = clamp(p * 1.7),
            interactive = p > 0.12,
        )
        onProgress?.invoke(p)
        return frame
    }

    fun set(v: Double) {
        anim?.stop()
        anim = null
        apply(v)
    }

    fun release(dir: String = "commit", velocity: Double = 0.0) {
        val commit = dir == "commit"
        val target = if (commit) 1.0 else 0.0
        val cfg = NovaMotionConfig.springConfig(springName)
        anim = SpringAnimation(
            from = p,
            to = target,
            velocity = capReleaseVelocity(p, target, cfg, (velocity / 700.0) * (if (commit) 1.0 else -1.0)),
            config = cfg,
            onUpdate = { v, _ -> apply(v) },
            clock = clock,
        )
    }
}

/* ── depth — Z changes recede the background, approach the window ─ */

data class DepthLayerSpec(val factor: Double = 1.0, val dim: Double = 0.0, val blur: Double = 0.0)
data class DepthFrame(val scale: Double, val blurPx: Double, val opacity: Double)

/**
 * docs/02 §5: raising a window recedes everything below Z=50 —
 * scale, dim and blur budget derived from one amount value.
 */
class DepthMotion(
    private val layers: List<DepthLayerSpec>,
    private val amount: Double = 1.0,
    private val clock: FrameClock = NovaMotion.clock,
) {
    private var current = 0.0
    private var anim: SpringAnimation? = null

    private fun farFactor(): Double =
        if (NovaMotionConfig.scaleCap() == 0.04) 0.01 else 0.04

    fun apply(v: Double): List<DepthFrame> {
        val value = clamp(v)
        current = value
        return layers.map { layer ->
            val s = 1.0 - farFactor() * layer.factor * value * amount
            val budget = NovaMotionConfig.blurPx()
            val b = if (layer.blur > 0.0 && budget > 0) budget * value * layer.blur else 0.0
            val opacity = if (layer.dim != 0.0) 1.0 - layer.dim * value else 1.0
            DepthFrame(s, b, opacity)
        }
    }

    fun set(v: Double) {
        anim?.stop()
        apply(clamp(v))
    }

    fun to(v: Double) {
        anim = SpringAnimation(
            from = current,
            to = v,
            config = NovaMotionConfig.springConfig("SOFT"),
            onUpdate = { value, _ -> apply(value) },
            clock = clock,
        )
    }
}

/* ── emit — one event, three outputs (motion + sound + haptic) ── */

val SOUND_EVENTS = listOf("open", "close", "success", "error", "tick", "defer", "orb", "sweep")

object NovaEmit {
    private val listeners = LinkedHashSet<(String, Map<String, Any?>) -> Unit>()

    /** Returns an unsubscribe function (the shell wires sound + haptics here, M8). */
    fun onEmit(fn: (kind: String, detail: Map<String, Any?>) -> Unit): () -> Unit {
        listeners.add(fn)
        return { listeners.remove(fn) }
    }

    fun emit(kind: String, detail: Map<String, Any?> = emptyMap()) {
        NovaMotion.stats.lastTransition = kind
        for (fn in listeners.toList()) fn(kind, detail)
    }
}

/* ── the facade ───────────────────────────────────────────────── */

/**
 * The engine façade — same names as docs/02 §9 / the web reference
 * `NovaMotion`. Surfaces never write a transform any other way.
 */
object NovaMotion {
    /** The default clock: pulse it from Choreographer; springs attach to it. */
    val clock: FrameClock = FrameClock { System.nanoTime() / 1_000_000.0 }

    val stats: FrameClock.Stats get() = clock.stats
    val springs: Map<String, NovaSpring> get() = Springs.ALL
    val profile: NovaMotionConfig.Profile get() = NovaMotionConfig.profile()

    fun spring(
        from: Double = 0.0,
        to: Double = 0.0,
        velocity: Double = 0.0,
        springName: String = "SOFT",
        travel: Double? = null,
        selfDriving: Boolean = false,
        onUpdate: ((Double, Double) -> Unit)? = null,
        onDone: ((Double) -> Unit)? = null,
    ): SpringAnimation = SpringAnimation(
        from = from,
        to = to,
        velocity = velocity,
        config = NovaMotionConfig.springConfig(springName),
        travel = travel,
        onUpdate = onUpdate,
        onDone = onDone,
        clock = if (selfDriving) clock else null,
    )

    fun morph(
        from: NovaRect,
        to: NovaRect,
        radiusFrom: Double = 22.0,
        radiusTo: Double = 28.0,
        springName: String = "SOFT",
        travel: Double = 1.0,
        arc: Double = 0.0,
        blur: Double = 0.0,
        fade: Double = 0.0,
        onProgress: ((Double) -> Unit)? = null,
        onDone: ((String, Double) -> Unit)? = null,
    ): MorphHandle = MorphHandle(
        plan = MorphPlan.plan(from, to, radiusFrom, radiusTo, arc, blur, fade),
        from = from,
        to = to,
        springName = springName,
        travel = travel,
        onProgress = onProgress,
        onDone = onDone,
    )

    fun panel(
        from: String = "bottom",
        distance: Double = 620.0,
        springName: String = "SOFT",
        onProgress: ((Double) -> Unit)? = null,
    ): PanelMotion = PanelMotion(from = from, distance = distance, springName = springName, onProgress = onProgress)

    fun duration(token: String = "NORMAL"): Int = NovaMotionConfig.token(token)
    fun stagger(base: Double? = null): Int = NovaMotionConfig.stagger(base)

    fun emit(kind: String, detail: Map<String, Any?> = emptyMap()) = NovaEmit.emit(kind, detail)
}
