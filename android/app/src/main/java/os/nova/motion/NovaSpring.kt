package os.nova.motion

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sqrt

/**
 * NOVA MOTION — springs (docs/02 §3).
 * The Kotlin port of `prototype/src/motion/springs.js`.
 *
 * The physics runs in [Double] so the integration stays bit-identical
 * with the JS reference — `tools/golden-curves.mjs` records the JS
 * trajectories and `NovaChecks` replays them here sample-for-sample.
 * Render layers convert to Float at the edge.
 *
 * a = (-k·(x - target) - c·v) / m, integrated semi-implicitly at a
 * fixed substep, damping ratio ζ = c / (2·√(k·m)).
 */

/** One spring: stiffness k, damping c, mass m (all in SI-ish engine units). */
data class NovaSpring(val stiffness: Double, val damping: Double, val mass: Double)

/** The six named springs of the motion contract (docs/02 §3). */
object Springs {
    /** ζ ≈ .82 — panels, sheets. */
    val SOFT = NovaSpring(180.0, 22.0, 1.0)

    /** ζ ≈ .84 — buttons, toggles. */
    val SNAP = NovaSpring(320.0, 30.0, 1.0)

    /** ζ ≈ .63 — Liquid motion theme. */
    val LIQUID = NovaSpring(120.0, 14.0, 1.1)

    /** ζ ≈ .65 — Orbit motion theme. */
    val ORBIT = NovaSpring(240.0, 20.0, 0.9)

    /** ζ ≈ .50 — small overshoot. */
    val ELASTIC = NovaSpring(260.0, 16.0, 1.0)

    /** ζ ≈ 1.08 — windows, canvas. */
    val HEAVY = NovaSpring(90.0, 26.0, 1.6)

    val ALL: Map<String, NovaSpring> = mapOf(
        "SOFT" to SOFT,
        "SNAP" to SNAP,
        "LIQUID" to LIQUID,
        "ORBIT" to ORBIT,
        "ELASTIC" to ELASTIC,
        "HEAVY" to HEAVY,
    )

    operator fun get(name: String): NovaSpring? = ALL[name]
}

/** Peak overshoot may never exceed 6 % of travel — the motion contract. */
const val MAX_OVERSHOOT = 0.06

/**
 * Peak overshoot = e^(−πζ/√(1−ζ²)); 6 % needs ζ ≥ 0.667 — we use
 * 0.68 (≈ 5.4 %) so rounding can never break the budget.
 */
const val MIN_ZETA = 0.68

/** Integration substep: springs are stepped at 240 Hz inside each frame. */
const val SUBSTEP = 1.0 / 240.0

/** Mutable spring integration state. */
data class SpringState(var x: Double, var v: Double)

/** Travel-relative settle thresholds (docs/02 §3). */
data class SettleThresholds(val settleX: Double, val settleV: Double)

fun dampingRatio(cfg: NovaSpring): Double =
    cfg.damping / (2.0 * sqrt(cfg.stiffness * cfg.mass))

/** A spring that cannot overshoot at all (Reduced Motion, Fast profile). */
fun criticallyDamped(cfg: NovaSpring): NovaSpring =
    NovaSpring(cfg.stiffness, 2.0 * sqrt(cfg.stiffness * cfg.mass), cfg.mass)

/** Clamp a spring's damping so overshoot never exceeds 6 % of travel. */
fun capOvershoot(cfg: NovaSpring): NovaSpring {
    val z = dampingRatio(cfg)
    if (z >= 1.0) return cfg
    if (z < MIN_ZETA) {
        return NovaSpring(cfg.stiffness, MIN_ZETA * 2.0 * sqrt(cfg.stiffness * cfg.mass), cfg.mass)
    }
    return cfg
}

/**
 * Settle thresholds are relative to the travel distance, so a 0→1 progress
 * spring and a 600 px panel spring stop at the same *visual* moment:
 * position within 0.6 % of travel (never more than 0.5 px) and slow enough.
 */
fun settleThresholds(travel: Double = 1.0): SettleThresholds {
    val a = abs(travel)
    val dist = if (a == 0.0 || a.isNaN()) 1.0 else a // JS: Math.abs(travel) || 1
    val settleX = min(0.5, kotlin.math.max(0.002, dist * 0.006))
    val settleV = min(4.0, kotlin.math.max(0.02, settleX * 8.0))
    return SettleThresholds(settleX, settleV)
}

/** One semi-implicit integration of `dt` seconds, split into ≤ 24 substeps. */
fun integrate(state: SpringState, target: Double, cfg: NovaSpring, dt: Double) {
    var steps = min(ceil(dt / SUBSTEP), 24.0).toInt()
    if (steps <= 0) return // JS runs a zero-length loop for dt ≤ 0 — same no-op
    val h = dt / steps
    var n = steps
    while (n-- > 0) {
        val a = (-cfg.stiffness * (state.x - target) - cfg.damping * state.v) / cfg.mass
        state.v += a * h
        state.x += state.v * h
    }
}

fun isSettled(
    state: SpringState,
    target: Double,
    settleX: Double = 0.4,
    settleV: Double = 0.4,
): Boolean = abs(state.x - target) < settleX && abs(state.v) < settleV

/** Peak overshoot fraction for a given spring (tests & telemetry). */
fun overshootOf(cfg: NovaSpring): Double {
    val z = dampingRatio(cfg)
    if (z >= 1.0) return 0.0
    return exp(-z * kotlin.math.PI / sqrt(1.0 - z * z))
}
