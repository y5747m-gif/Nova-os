package os.nova.motion

import kotlin.math.abs
import kotlin.math.max

/**
 * Shared assertions for the Kotlin port of NOVA MOTION.
 *
 * Three groups:
 *  1. **Golden curves** — replay `golden-curves.json` (produced from the JS
 *     engine by `tools/golden-curves.mjs`) and prove the port reproduces
 *     every constant, resolved spring and 60 Hz trajectory sample-for-sample,
 *     inside every motion-contract budget (docs/02 §11).
 *  2. **Physics** — golden-independent behaviour of springs, settle
 *     thresholds, velocity caps and the interruptible animation handle.
 *  3. **Engine** — morph / panel / orbital / cascade / depth / frame clock /
 *     emit: the surfaces' toolbox.
 *
 * Consumed by the JUnit wrappers (`NovaMotionGoldenTest`, `NovaSpringTest`)
 * and by `GoldenMain` (standalone, no JUnit needed).
 */
object NovaChecks {

    /** Sample-for-sample trajectory tolerance — doubles on both sides, so near-zero. */
    const val TRACE_TOL = 1e-9

    /** Constant / stat tolerance (covers transcendental rounding in helpers). */
    const val VALUE_TOL = 1e-12

    /** The motion contract budgets (docs/02 §11 / spring-check.mjs). */
    const val OVERSHOOT_BUDGET = 0.065
    const val SETTLE_BUDGET_MS = 900.0
    const val RETARGET_JUMP_BUDGET = 0.12

    private fun fail(into: MutableList<String>, condition: Boolean, message: String) {
        if (!condition) into.add(message)
    }

    private fun MutableList<String>.check(condition: Boolean, message: String) = fail(this, condition, message)

    private fun near(a: Double, b: Double, tol: Double = VALUE_TOL): Boolean = abs(a - b) <= tol

    private fun springNear(got: NovaSpring, want: NovaSpring, tol: Double = VALUE_TOL): Boolean =
        near(got.stiffness, want.stiffness, tol) &&
            near(got.damping, want.damping, tol) &&
            near(got.mass, want.mass, tol)

    private fun springText(s: NovaSpring): String =
        "{k=${s.stiffness}, c=${s.damping}, m=${s.mass}}"

    /** Locale-independent "%.2f" for failure messages. */
    private fun fmt2(v: Double): String =
        String.format(java.util.Locale.ROOT, "%.2f", v)

    /* ══════ golden trajectory replays JS `simulate()` exactly ══════ */

    data class RetargetSpec(val at: Double, val to: Double, val velocity: Double)

    data class SimResult(
        val overshoot: Double,
        val settle: Double,
        val jumpedBack: Boolean,
        val trace: DoubleArray,
    ) {
        override fun equals(other: Any?): Boolean = this === other
        override fun hashCode(): Int = System.identityHashCode(this)
    }

    fun simulate(
        cfg: NovaSpring,
        from: Double = 0.0,
        to: Double = 1.0,
        velocity: Double = 0.0,
        retarget: RetargetSpec? = null,
    ): SimResult {
        val dt = 1.0 / 60.0
        val maxT = 3.0
        val st = SpringState(from, velocity)
        var target = to
        var t = 0.0
        var peak = from
        var settledAt: Double? = null
        var jumpedBack = false
        var last = from
        val trace = ArrayList<Double>(192)

        while (t < maxT) {
            if (retarget != null && abs(t - retarget.at) < dt) {
                target = retarget.to
                st.v = retarget.velocity
            }
            integrate(st, target, cfg, dt)
            t += dt
            peak = max(peak, st.x)
            if (target > last && st.x < last - 1e-6 && st.x > 0) jumpedBack = true
            last = st.x
            trace.add(st.x)
            val th = settleThresholds(abs(target - from))
            if (settledAt == null && isSettled(st, target, th.settleX, th.settleV)) settledAt = t
        }

        val denom = (to - from).let { if (it == 0.0 || it.isNaN()) 1.0 else it }
        return SimResult(
            overshoot = max(0.0, (peak - to) / denom),
            settle = settledAt ?: Double.POSITIVE_INFINITY,
            jumpedBack = jumpedBack,
            trace = trace.toDoubleArray(),
        )
    }

    private fun settleMatches(got: Double, want: Double): Boolean =
        if (want.isInfinite()) got.isInfinite() else near(got, want, 1e-9)

    private fun traceMatches(
        failures: MutableList<String>,
        label: String,
        got: DoubleArray,
        want: DoubleArray,
    ): Boolean {
        failures.check(got.size == want.size, "$label: trace length ${got.size} != golden ${want.size}")
        if (got.size != want.size) return false
        var worst = 0.0
        var worstAt = -1
        for (i in want.indices) {
            val d = abs(got[i] - want[i])
            if (d > worst) { worst = d; worstAt = i }
        }
        failures.check(worst <= TRACE_TOL, "$label: trace deviates by $worst at sample $worstAt (tol $TRACE_TOL)")
        return worst <= TRACE_TOL
    }

    /* ══════ 1a. constants: the port copied the right numbers ══════ */

    fun constantsFailures(g: Map<String, Any?>): List<String> {
        val out = mutableListOf<String>()
        with(GoldenJson) {
            val c = g.obj("constants")

            val wantSprings = c.obj("springs")
            out.check(Springs.ALL.keys == wantSprings.keys, "springs: names ${Springs.ALL.keys} != ${wantSprings.keys}")
            for ((name, want) in wantSprings) {
                val got = Springs.ALL[name]
                if (got == null) { out.add("springs.$name: missing in Kotlin"); continue }
                val w = spring(want as Map<String, Any?>)
                out.check(near(got.stiffness, w.stiffness) && near(got.damping, w.damping) && near(got.mass, w.mass),
                    "springs.$name: ${springText(got)} != ${springText(w)}")
            }

            val wantTokens = c.obj("tokens")
            out.check(NovaMotionConfig.TOKENS.size == wantTokens.size, "tokens: count mismatch")
            for ((name, want) in wantTokens) {
                out.check(NovaMotionConfig.TOKENS[name] == (want as Double).toInt(),
                    "tokens.$name: ${NovaMotionConfig.TOKENS[name]} != ${want as Double}")
            }

            out.check(near(MIN_ZETA, c.num("minZeta")), "MIN_ZETA $MIN_ZETA != ${c.num("minZeta")}")
            out.check(near(MAX_OVERSHOOT, c.num("maxOvershoot")), "MAX_OVERSHOOT $MAX_OVERSHOOT != ${c.num("maxOvershoot")}")
            out.check(near(SUBSTEP, c.num("substep")), "SUBSTEP $SUBSTEP != ${c.num("substep")}")

            val wantProfiles = c.obj("profiles")
            out.check(NovaMotionConfig.PROFILES.keys == wantProfiles.keys, "profiles: names mismatch")
            for ((id, wantMap) in wantProfiles) {
                val want = wantMap as Map<String, Any?>
                val got = NovaMotionConfig.PROFILES[id]
                if (got == null) { out.add("profiles.$id: missing"); continue }
                out.check(got.label == want.str("label"), "profiles.$id.label mismatch")
                out.check(got.note == want.str("note"), "profiles.$id.note mismatch")
                out.check(near(got.timeScale, want.num("timeScale")), "profiles.$id.timeScale ${got.timeScale} != ${want.num("timeScale")}")
                out.check(near(got.stagger, want.num("stagger")), "profiles.$id.stagger ${got.stagger} != ${want.num("stagger")}")
                out.check(near(got.blur, want.num("blur")), "profiles.$id.blur ${got.blur} != ${want.num("blur")}")
                out.check(near(got.parallax, want.num("parallax")), "profiles.$id.parallax ${got.parallax} != ${want.num("parallax")}")
                out.check(near(got.springStiff, want.num("springStiff")), "profiles.$id.springStiff ${got.springStiff} != ${want.num("springStiff")}")
                out.check(near(got.springDamp, want.num("springDamp")), "profiles.$id.springDamp ${got.springDamp} != ${want.num("springDamp")}")
                out.check(near(got.scaleMax, want.num("scaleMax")), "profiles.$id.scaleMax ${got.scaleMax} != ${want.num("scaleMax")}")
                out.check(got.arcs == want.bool("arcs"), "profiles.$id.arcs ${got.arcs} != ${want.bool("arcs")}")
                val wantOvershoot = when (want.str("overshoot")) {
                    "full" -> NovaMotionConfig.OvershootPolicy.FULL
                    "none" -> NovaMotionConfig.OvershootPolicy.NONE
                    else -> null
                }
                out.check(got.overshoot == wantOvershoot, "profiles.$id.overshoot ${got.overshoot} != ${want.str("overshoot")}")
                out.check(got.critical == want.boolOr("critical", false),
                    "profiles.$id.critical ${got.critical} != ${want.boolOr("critical", false)}")
            }

            val wantThemes = c.obj("themes")
            out.check(NovaMotionConfig.THEMES.keys == wantThemes.keys, "themes: names mismatch")
            for ((id, wantMap) in wantThemes) {
                val want = wantMap as Map<String, Any?>
                val got = NovaMotionConfig.THEMES[id]
                if (got == null) { out.add("themes.$id: missing"); continue }
                out.check(got.label == want.str("label"), "themes.$id.label mismatch")
                out.check(got.note == want.str("note"), "themes.$id.note mismatch")
                out.check(got.spring == want.str("spring"), "themes.$id.spring ${got.spring} != ${want.str("spring")}")
                out.check(near(got.timeScale, want.num("timeScale")), "themes.$id.timeScale mismatch")
                out.check(near(got.stagger, want.num("stagger")), "themes.$id.stagger mismatch")
                out.check(near(got.overshoot, want.num("overshoot")), "themes.$id.overshoot mismatch")
                out.check(near(got.arc, want.num("arc")), "themes.$id.arc mismatch")
                out.check(near(got.blur, want.num("blur")), "themes.$id.blur mismatch")
            }
        }
        return out
    }

    /* ══════ 1b. every profile × theme: spring + full trajectory ══════ */

    fun profileThemeFailures(g: Map<String, Any?>): List<String> {
        val out = mutableListOf<String>()
        with(GoldenJson) {
            for (caseMap in g.arr("profileTheme")) {
                val case = caseMap as Map<String, Any?>
                val profile = case.str("profile")
                val theme = case.str("theme")
                val label = "$profile/$theme"
                NovaMotionConfig.setProfile(profile)
                NovaMotionConfig.setTheme(theme)

                val cfg = NovaMotionConfig.springConfig("theme")
                out.check(springNear(cfg, spring(case.obj("cfg"))), "$label: springConfig(theme) ${springText(cfg)} != golden ${spring(case.obj("cfg"))}")
                val soft = NovaMotionConfig.springConfig("SOFT")
                out.check(springNear(soft, spring(case.obj("softCfg"))), "$label: springConfig(SOFT) ${springText(soft)} != golden ${spring(case.obj("softCfg"))}")

                /* the non-spring config surface */
                out.check(near(NovaMotionConfig.scaleCap(), case.num("scaleCap")), "$label: scaleCap ${NovaMotionConfig.scaleCap()} != ${case.num("scaleCap")}")
                out.check(NovaMotionConfig.usesArcs() == case.bool("usesArcs"), "$label: usesArcs ${NovaMotionConfig.usesArcs()} != ${case.bool("usesArcs")}")
                out.check(NovaMotionConfig.blurPx() == case.num("blurPx").toInt(), "$label: blurPx ${NovaMotionConfig.blurPx()} != ${case.num("blurPx")}")
                out.check(near(NovaMotionConfig.parallax(), case.num("parallax")), "$label: parallax mismatch")
                val wantTokens = case.arr("tokens")
                for ((i, name) in listOf("FAST", "NORMAL", "SLOW", "LONG").withIndex()) {
                    val want = (wantTokens[i] as Double).toInt()
                    out.check(NovaMotionConfig.token(name) == want, "$label: token($name) ${NovaMotionConfig.token(name)} != $want")
                }
                out.check(NovaMotionConfig.stagger(40.0) == case.num("stagger40").toInt(),
                    "$label: stagger(40) ${NovaMotionConfig.stagger(40.0)} != ${case.num("stagger40")}")

                /* the golden trajectory itself */
                val wantTrace = trace(case.str("trace"))
                val r = simulate(cfg)
                traceMatches(out, label, r.trace, wantTrace)
                out.check(near(r.overshoot, case.num("overshoot")), "$label: overshoot ${r.overshoot} != golden ${case.num("overshoot")}")
                val wantSettle = case.numOrNull("settle") ?: Double.POSITIVE_INFINITY
                out.check(settleMatches(r.settle, wantSettle), "$label: settle $r.settle != golden $wantSettle")
                out.check(near(r.trace.last(), case.num("final")), "$label: final ${r.trace.last()} != golden ${case.num("final")}")
                out.check(r.jumpedBack == case.bool("jumpedBack"), "$label: jumpedBack ${r.jumpedBack} != ${case.bool("jumpedBack")}")

                /* the motion-contract budgets (spring-check.mjs) */
                out.check(r.overshoot <= OVERSHOOT_BUDGET, "$label: overshoot ${fmt2(r.overshoot * 100)}% > budget ${(OVERSHOOT_BUDGET * 100)}%")
                out.check(r.settle < SETTLE_BUDGET_MS / 1000.0, "$label: settle ${r.settle} >= 900ms budget")
                out.check(abs(r.trace.last() - 1.0) < 0.01, "$label: final ${r.trace.last()} snapped early (|final-1| >= 0.01)")

                if (profile == "reduced") {
                    val z = dampingRatio(cfg)
                    out.check(abs(z - 1.0) < 0.01, "$label: not critically damped (ζ=$z)")
                    out.check(NovaMotionConfig.scaleCap() <= 0.04, "$label: scale cap > 4%")
                    out.check(!NovaMotionConfig.usesArcs(), "$label: Reduced Motion must not use arcs")
                    out.check(NovaMotionConfig.blurPx() == 0, "$label: Reduced Motion must not blur")
                }
            }
        }
        NovaMotionConfig.setProfile(NovaMotionConfig.DEFAULT_PROFILE)
        NovaMotionConfig.setTheme(NovaMotionConfig.DEFAULT_THEME)
        return out
    }

    /* ══════ 1c. release velocities never break the 6 % budget (M2) ══════ */

    fun velocityFailures(g: Map<String, Any?>): List<String> {
        val out = mutableListOf<String>()
        with(GoldenJson) {
            NovaMotionConfig.setProfile("balanced")
            for (caseMap in g.arr("velocity")) {
                val case = caseMap as Map<String, Any?>
                val theme = case.str("theme")
                val vIn = case.num("velocityIn")
                val label = "velocity $theme @ ${case.num("velocityIn")}"
                NovaMotionConfig.setTheme(theme)

                val cfg = NovaMotionConfig.springConfig("theme")
                out.check(springNear(cfg, spring(case.obj("cfg"))), "$label: cfg mismatch")

                val seeded = capReleaseVelocity(0.0, 1.0, cfg, vIn)
                out.check(near(seeded, case.num("velocityCapped")), "$label: capped velocity $seeded != golden ${case.num("velocityCapped")}")

                val r = simulate(cfg, velocity = seeded)
                traceMatches(out, label, r.trace, trace(case.str("trace")))
                out.check(near(r.overshoot, case.num("overshoot")), "$label: overshoot mismatch")
                out.check(r.overshoot <= OVERSHOOT_BUDGET, "$label: overshoot ${fmt2(r.overshoot * 100)}% breaks the 6.5% budget (v0=$seeded)")
                val wantSettle = case.numOrNull("settle") ?: Double.POSITIVE_INFINITY
                out.check(settleMatches(r.settle, wantSettle), "$label: settle mismatch")
                out.check(r.settle < SETTLE_BUDGET_MS / 1000.0, "$label: settle >= 900ms")
            }
        }
        NovaMotionConfig.setProfile(NovaMotionConfig.DEFAULT_PROFILE)
        NovaMotionConfig.setTheme(NovaMotionConfig.DEFAULT_THEME)
        return out
    }

    /* ══════ 1d. re-target mid-flight (M6) ══════ */

    fun retargetFailures(g: Map<String, Any?>): List<String> {
        val out = mutableListOf<String>()
        with(GoldenJson) {
            val case = g.obj("retarget")
            NovaMotionConfig.setProfile(case.str("profile"))
            NovaMotionConfig.setTheme(case.str("theme"))
            val cfg = NovaMotionConfig.springConfig("SOFT")
            out.check(springNear(cfg, spring(case.obj("cfg"))), "retarget: cfg mismatch")

            val r = simulate(cfg, retarget = RetargetSpec(case.num("at"), case.num("to"), case.num("velocity")))
            traceMatches(out, "retarget", r.trace, trace(case.str("trace")))

            val wantSettle = case.numOrNull("settle") ?: Double.POSITIVE_INFINITY
            out.check(settleMatches(r.settle, wantSettle), "retarget: settle $r.settle != golden $wantSettle")
            out.check(r.settle < SETTLE_BUDGET_MS / 1000.0, "retarget: keeps a single settle — ${r.settle}s < 0.9s")

            val maxStep = r.trace.mapIndexed { i, x -> if (i == 0) 0.0 else abs(x - r.trace[i - 1]) }.max()
            out.check(near(maxStep, case.num("maxStep")), "retarget: maxStep $maxStep != golden ${case.num("maxStep")}")
            out.check(maxStep < RETARGET_JUMP_BUDGET, "retarget: visual jump max step $maxStep >= $RETARGET_JUMP_BUDGET")
            out.check(r.jumpedBack == case.bool("jumpedBack"), "retarget: jumpedBack mismatch")
        }
        NovaMotionConfig.setProfile(NovaMotionConfig.DEFAULT_PROFILE)
        NovaMotionConfig.setTheme(NovaMotionConfig.DEFAULT_THEME)
        return out
    }

    /* ══════ 1e. the guards themselves ══════ */

    fun helperFailures(g: Map<String, Any?>): List<String> {
        val out = mutableListOf<String>()
        with(GoldenJson) {
            val h = g.obj("helpers")

            val wild = h.obj("capOvershootWild")
            val wildIn = spring(wild.obj("input"))
            val wildOut = capOvershoot(wildIn)
            out.check(springNear(wildOut, spring(wild.obj("cfg"))), "capOvershoot(wild): ${springText(wildOut)} != golden")
            out.check(near(dampingRatio(wildOut), wild.num("dampingRatio")), "capOvershoot(wild): ζ mismatch")
            out.check(dampingRatio(wildOut) >= MIN_ZETA, "capOvershoot(wild): ζ ${dampingRatio(wildOut)} < MIN_ZETA")
            val wildSim = simulate(wildOut)
            out.check(near(wildSim.overshoot, wild.num("overshoot")), "capOvershoot(wild): overshoot mismatch vs golden")
            out.check(wildSim.overshoot <= OVERSHOOT_BUDGET, "capOvershoot(wild): overshoot ${fmt2(wildSim.overshoot * 100)}% > 6.5%")

            val crit = h.obj("criticallyDamped")
            val critIn = spring(crit.obj("input"))
            val critOut = criticallyDamped(critIn)
            out.check(springNear(critOut, spring(crit.obj("cfg"))), "criticallyDamped: cfg mismatch")
            out.check(abs(dampingRatio(critOut) - 1.0) < 1e-6, "criticallyDamped: ζ ${dampingRatio(critOut)} != 1")
            out.check(near(dampingRatio(critOut), crit.num("dampingRatio"), 1e-9), "criticallyDamped: ζ vs golden mismatch")

            for (thMap in h.arr("settleThresholds")) {
                val th = thMap as Map<String, Any?>
                val travel = th.num("travel")
                val got = settleThresholds(travel)
                out.check(near(got.settleX, th.num("settleX")), "settleThresholds($travel).settleX ${got.settleX} != ${th.num("settleX")}")
                out.check(near(got.settleV, th.num("settleV")), "settleThresholds($travel).settleV ${got.settleV} != ${th.num("settleV")}")
            }

            val perSpring = h.obj("perSpring")
            for ((name, entryMap) in perSpring) {
                val entry = entryMap as Map<String, Any?>
                val cfg = Springs.ALL[name]
                if (cfg == null) { out.add("perSpring.$name: missing"); continue }
                out.check(near(dampingRatio(cfg), entry.num("dampingRatio")), "perSpring.$name: ζ mismatch")
                out.check(near(overshootOf(cfg), entry.num("overshoot"), 1e-9), "perSpring.$name: overshootOf mismatch")
            }
        }
        return out
    }

    /* ══════ 2. physics — golden-independent behaviour ══════ */

    fun physicsFailures(): List<String> {
        val out = mutableListOf<String>()
        NovaMotionConfig.setProfile(NovaMotionConfig.DEFAULT_PROFILE)
        NovaMotionConfig.setTheme(NovaMotionConfig.DEFAULT_THEME)

        /* travel-relative settle thresholds */
        out.check(near(settleThresholds(1.0).settleX, 0.006), "settleThresholds(1).settleX != 0.006")
        out.check(near(settleThresholds(1.0).settleV, 0.048), "settleThresholds(1).settleV != 0.048")
        out.check(settleThresholds(0.0) == settleThresholds(1.0), "settleThresholds(0) must fall back to unit travel")
        out.check(settleThresholds(600.0).settleX == 0.5, "settleThresholds(600).settleX must cap at 0.5 px")
        out.check(settleThresholds(600.0).settleV == 4.0, "settleThresholds(600).settleV must cap at 4")
        out.check(settleThresholds(0.1).settleX == 0.002, "settleThresholds(0.1).settleX must floor at 0.002")
        out.check(settleThresholds(0.1).settleV == 0.02, "settleThresholds(0.1).settleV must floor at 0.02")

        /* damping guards */
        out.check(near(dampingRatio(criticallyDamped(Springs.SOFT)), 1.0), "criticallyDamped(SOFT) ζ != 1")
        out.check(near(dampingRatio(capOvershoot(Springs.ELASTIC)), MIN_ZETA), "capOvershoot(ELASTIC) must clamp to MIN_ZETA")
        out.check(capOvershoot(Springs.SOFT) == Springs.SOFT, "capOvershoot must leave healthy springs alone")
        out.check(capOvershoot(Springs.HEAVY) == Springs.HEAVY, "capOvershoot must leave overdamped springs alone")
        out.check(MAX_OVERSHOOT == 0.06 && MIN_ZETA == 0.68, "contract constants drifted")

        /* integrate + settle */
        val st = SpringState(0.0, 0.0)
        val crit = criticallyDamped(Springs.SOFT)
        var frames = 0
        while (frames < 60 && !isSettled(st, 1.0, settleThresholds(1.0).settleX, settleThresholds(1.0).settleV)) {
            integrate(st, 1.0, crit, 1.0 / 60.0)
            frames++
        }
        out.check(isSettled(st, 1.0, settleThresholds(1.0).settleX, settleThresholds(1.0).settleV),
            "critically damped spring must settle within 1s (stuck at ${st.x})")
        out.check(abs(st.x - 1.0) < 0.01, "settled position ${st.x} not near target")
        out.check(!isSettled(SpringState(1.02, 0.0), 1.0, 0.006, 0.048), "isSettled must respect the position threshold")

        /* dt = 0 is a no-op, not a NaN machine */
        val still = SpringState(0.5, 1.0)
        integrate(still, 1.0, Springs.SOFT, 0.0)
        out.check(still.x == 0.5 && still.v == 1.0, "integrate(dt=0) must not move the state")

        /* SpringAnimation: natural finish, single onDone, exact snap */
        var updates = 0
        var lastV = -1.0
        var dones = 0
        var doneAt = -1.0
        val anim = SpringAnimation(
            from = 0.0, to = 1.0, config = Springs.SOFT,
            onUpdate = { _, v -> updates++; lastV = v },
            onDone = { x -> dones++; doneAt = x },
        )
        var steps = 0
        while (!anim.done && steps < 300) { anim.advance(1.0 / 60.0); steps++ }
        out.check(anim.done, "SpringAnimation must finish within 5s")
        out.check(anim.value == 1.0, "settled value ${anim.value} must snap exactly to target")
        out.check(anim.velocity == 0.0, "settled velocity must be 0")
        out.check(lastV == 0.0, "last onUpdate must report zero velocity (got $lastV)")
        out.check(dones == 1 && doneAt == 1.0, "onDone must fire exactly once with the target (dones=$dones)")
        out.check(updates > 10, "SpringAnimation must report progress (updates=$updates)")
        out.check(!anim.advance(1.0 / 60.0), "advance() after stop must stay false")

        /* SpringAnimation: retarget preserves velocity (M6) */
        var doneX = -99.0
        val anim2 = SpringAnimation(from = 0.0, to = 1.0, config = Springs.SOFT, onDone = { doneX = it })
        repeat(10) { anim2.advance(1.0 / 60.0) }
        val vBefore = anim2.velocity
        out.check(vBefore > 0.0, "spring must be moving toward the target before retarget")
        anim2.retarget(0.0, -3.0)
        out.check(anim2.velocity == -3.0, "retarget(vel) must apply the velocity exactly (got ${anim2.velocity})")
        steps = 0
        while (!anim2.done && steps < 300) { anim2.advance(1.0 / 60.0); steps++ }
        out.check(anim2.done && anim2.value == 0.0, "retargeted spring must settle at the new target (x=${anim2.value})")
        out.check(doneX == 0.0, "retarget onDone must report the new target (got $doneX)")

        /* capReleaseVelocity: the flick can add energy, never break the budget */
        val cfg = NovaMotionConfig.springConfig("SOFT")
        val omega = kotlin.math.sqrt(cfg.stiffness / cfg.mass)
        val cap = 0.32 * omega * 1.0
        out.check(near(capReleaseVelocity(0.0, 1.0, cfg, 1000.0), cap), "capReleaseVelocity must clamp hard flicks")
        out.check(near(capReleaseVelocity(0.0, 1.0, cfg, -1000.0), -cap), "capReleaseVelocity must clamp negative flicks")
        out.check(capReleaseVelocity(0.0, 1.0, cfg, 1.0) == 1.0, "small velocities pass through untouched")
        out.check(capReleaseVelocity(0.0, 0.0, cfg, 99.0) == 0.32 * omega * 0.12,
            "zero travel uses the 0.12 remaining floor")

        return out
    }

    /* ══════ 3. engine — the surfaces' toolbox ══════ */

    fun engineFailures(): List<String> {
        val out = mutableListOf<String>()
        NovaMotionConfig.setProfile(NovaMotionConfig.DEFAULT_PROFILE)
        NovaMotionConfig.setTheme(NovaMotionConfig.DEFAULT_THEME)

        /* primitives */
        out.check(clamp(1.5) == 1.0 && clamp(-0.5) == 0.0 && clamp(0.3) == 0.3, "clamp broken")
        out.check(near(lerp(0.0, 10.0, 0.25), 2.5), "lerp broken")
        out.check(near(easeOut(0.0), 0.0) && near(easeOut(1.0), 1.0) && near(easeOut(0.5), 0.875), "easeOut must be cubic-out")

        /* token anchors for the default profile/theme (independent of the golden file) */
        NovaMotionConfig.setProfile("balanced")
        NovaMotionConfig.setTheme("aurora")
        out.check(NovaMotionConfig.token("FAST") == 150, "balanced/aurora FAST token ${NovaMotionConfig.token("FAST")} != 150")
        out.check(NovaMotionConfig.token("NORMAL") == 299, "balanced/aurora NORMAL token ${NovaMotionConfig.token("NORMAL")} != 299")
        out.check(NovaMotionConfig.token("SLOW") == 449, "balanced/aurora SLOW token ${NovaMotionConfig.token("SLOW")} != 449")
        out.check(NovaMotionConfig.token("LONG") == 608, "balanced/aurora LONG token ${NovaMotionConfig.token("LONG")} != 608")
        out.check(NovaMotionConfig.stagger(40.0) == 34, "balanced/aurora stagger ${NovaMotionConfig.stagger(40.0)} != 34")
        out.check(NovaMotionConfig.blurPx() == 9, "balanced/aurora blurPx ${NovaMotionConfig.blurPx()} != 9")
        out.check(near(NovaMotionConfig.parallax(), 0.5), "balanced parallax != 0.5")
        out.check(NovaMotionConfig.usesArcs(), "balanced/aurora must allow arcs")
        out.check(near(NovaMotionConfig.scaleCap(), 1.0), "balanced scaleCap != 1")

        NovaMotionConfig.setProfile("fast")
        out.check(near(dampingRatio(NovaMotionConfig.springConfig("SOFT")), 1.0), "Fast profile must be critically damped")
        out.check(NovaMotionConfig.blurPx() == 0 && !NovaMotionConfig.usesArcs(), "Fast profile must drop blur and arcs")
        NovaMotionConfig.setProfile("balanced")
        NovaMotionConfig.setTheme("minimal")
        out.check(near(dampingRatio(NovaMotionConfig.springConfig("ELASTIC")), 1.0),
            "Minimal theme must neutralise even ELASTIC springs")
        out.check(!NovaMotionConfig.usesArcs(), "Minimal theme must drop arcs")

        /* snapshot / restore */
        NovaMotionConfig.setProfile("fast")
        NovaMotionConfig.setTheme("neon")
        val snap = NovaMotionConfig.snapshot()
        NovaMotionConfig.setProfile("balanced")
        NovaMotionConfig.setTheme("aurora")
        NovaMotionConfig.restore(snap)
        out.check(NovaMotionConfig.profileId == "fast" && NovaMotionConfig.themeId == "neon", "snapshot/restore broken")
        NovaMotionConfig.setProfile("does-not-exist")
        out.check(NovaMotionConfig.profileId == "fast", "unknown profile names must be ignored")
        NovaMotionConfig.setProfile("balanced")
        NovaMotionConfig.setTheme("aurora")

        /* morph geometry */
        NovaMotionConfig.setProfile("cinematic")
        NovaMotionConfig.setTheme("aurora")
        val from = NovaRect(0.0, 0.0, 100.0, 100.0)
        val to = NovaRect(0.0, 300.0, 400.0, 700.0)
        val dx = 50.0 - 200.0
        val plan = MorphPlan.plan(from, to, arc = 1.0, blur = 4.0, fade = 0.5)
        val at0 = plan.apply(0.0)
        val at1 = plan.apply(1.0)
        val atHalf = plan.apply(0.5)
        out.check(near(at0.tx, dx) && near(at0.ty, -600.0), "morph@0 must sit on the source offset (got ${at0.tx},${at0.ty})")
        out.check(near(at0.sx, 0.25), "morph@0 sx ${at0.sx} != 0.25")
        out.check(near(at1.tx, 0.0) && near(at1.ty, 0.0), "morph@1 must arrive centred")
        out.check(near(at1.sx, 1.0) && near(at1.sy, 1.0), "morph@1 must be unit scale")
        out.check(near(at1.radius, 28.0), "morph@1 radius ${at1.radius} != 28")
        out.check(near(at0.radius, 22.0 / 0.2), "morph@0 radius ${at0.radius} != 110")
        out.check(at0.blurPx > 3.9 && at1.blurPx == 0.0, "morph blur must burn off with progress")
        out.check(near(at0.opacity, 0.5), "fade must dim the start (${at0.opacity})")
        out.check(abs(atHalf.tx - dx * 0.5) > 1.0, "cinematic morph must bow along an arc, not slide flat")

        NovaMotionConfig.setProfile("reduced")
        val planR = MorphPlan.plan(from, to, arc = 1.0, blur = 4.0)
        val rHalf = planR.apply(0.5)
        out.check(near(rHalf.tx, dx * 0.5), "Reduced Motion morph must be a flat translation")
        out.check(planR.apply(0.0).blurPx == 0.0, "Reduced Motion morph must not blur")
        val syReduced = planR.apply(0.0).sy
        out.check(syReduced >= 1.0 - 0.04 * 0.9 - 1e-9, "Reduced Motion must not scale below the 4% cap")
        NovaMotionConfig.setProfile("balanced")
        NovaMotionConfig.setTheme("aurora")

        /* panel */
        val panel = NovaMotion.panel(from = "bottom", distance = 620.0)
        val p0 = panel.apply(0.0)
        val p1 = panel.apply(1.0)
        out.check(near(p0.ty, 620.0) && near(p0.scale, 0.94) && near(p0.opacity, 0.0) && !p0.interactive,
            "panel@0 must start off-screen, scaled down and inert")
        out.check(near(p1.ty, 0.0) && near(p1.scale, 1.0) && near(p1.opacity, 1.0) && p1.interactive,
            "panel@1 must be fully open and touchable")
        val panelTop = NovaMotion.panel(from = "top", distance = 620.0)
        out.check(near(panelTop.apply(0.0).ty, -620.0), "top panels slide down from above")

        /* orbital: staggered arrival, unit scale + alpha at the end */
        var minAlphaAtEnd = 1.0
        var maxRadiusAtEnd = 0.0
        val orbit = OrbitalMotion(
            items = listOf(0, 1, 2, 3),
            centerX = 0.0, centerY = 0.0, radius = 100.0,
            angleOf = { _, i -> i * (kotlin.math.PI * 2 / 4) },
            onItem = { _, _, s ->
                if (s.p == 1.0) {
                    minAlphaAtEnd = minOf(minAlphaAtEnd, s.alpha)
                    maxRadiusAtEnd = maxOf(maxRadiusAtEnd, kotlin.math.hypot(s.x, s.y))
                }
            },
        )
        orbit.set(0.0)
        orbit.layout(1.0)
        out.check(near(minAlphaAtEnd, 1.0), "orbital items must arrive fully opaque (min α=$minAlphaAtEnd)")
        out.check(near(maxRadiusAtEnd, 100.0), "arrived orbital items must sit on the ring (r=$maxRadiusAtEnd)")

        /* cascade: earlier siblings always lead (one layout per sample) */
        val progresses = mutableListOf<Double>()
        val cascade = CascadeMotion(
            items = (0 until 5).toList(),
            staggerMs = 40.0,
            span = 460.0,
            onItem = { i: Int, _, ip: Double, _ ->
                if (i == 0) progresses.clear()
                progresses.add(ip)
            },
        )
        cascade.set(0.5)
        out.check(progresses.size == 5, "cascade must layout every item")
        out.check(progresses.zipWithNext().all { (a, b) -> a >= b - 1e-9 },
            "cascade items must be staggered in order: $progresses")
        out.check(progresses.first() > progresses.last(), "first cascade item must lead the last")

        /* depth: background recedes, blur honours the budget, Reduced Motion softens */
        NovaMotionConfig.setProfile("cinematic")
        val depth = DepthMotion(listOf(DepthLayerSpec(factor = 1.0, dim = 0.3, blur = 2.0)))
        depth.set(0.0)
        val d0 = depth.apply(0.0).first()
        val d1 = depth.apply(1.0).first()
        out.check(near(d0.scale, 1.0) && near(d0.opacity, 1.0) && d0.blurPx == 0.0, "depth@0 must be untouched")
        out.check(near(d1.scale, 0.96), "depth@1 must recede by 4% (got ${d1.scale})")
        out.check(near(d1.opacity, 0.7), "depth@1 must dim to 70% (got ${d1.opacity})")
        out.check(near(d1.blurPx, NovaMotionConfig.blurPx().toDouble() * 2.0), "depth blur must scale with the budget")
        NovaMotionConfig.setProfile("reduced")
        val dR = depth.apply(1.0).first()
        out.check(near(dR.scale, 0.99), "Reduced Motion depth recedes by 1% only (got ${dR.scale})")
        NovaMotionConfig.setProfile("balanced")

        /* frame clock: dt, fps window (ticker clamps any dt at 64 ms), idle-is-idle */
        var now = 1000.0
        val clock = FrameClock { now }
        var gotDt = -1.0
        val off = clock.onFrame { dt, _ -> gotDt = dt }
        now = 1016.0
        clock.pulse(now)
        out.check(near(gotDt, 0.016), "clock dt ${gotDt} != 0.016")
        out.check(clock.stats.frameCount == 1, "clock must count frames")
        repeat(36) { now += 16.0; clock.pulse(now) } // steady 60 Hz for the fps window
        out.check(clock.stats.fps in 60..66, "clock fps ${clock.stats.fps} != ~60 over the 0.5s window")
        off()
        val framesAfter = clock.stats.frameCount
        clock.pulse(now + 16.0)
        out.check(clock.stats.active == 0, "empty clock must report no active animations")
        clock.pulse(now + 32.0)
        out.check(clock.stats.frameCount == framesAfter + 1 || !clock.isRunning,
            "clock must stop pulsing once idle")
        val wasRunning = clock.isRunning
        clock.pulse(now + 48.0)
        if (!wasRunning) out.check(clock.stats.frameCount == framesAfter + 1, "stopped clock must not tick")

        /* self-driving spring stops the clock when it settles */
        var now2 = 0.0
        val clock2 = FrameClock { now2 }
        var finished = false
        SpringAnimation(from = 0.0, to = 1.0, config = Springs.SOFT, onDone = { finished = true }, clock = clock2)
        var pulses = 0
        while (!finished && pulses < 300) {
            now2 += 1000.0 / 60.0
            clock2.pulse(now2)
            pulses++
        }
        out.check(finished, "clock-driven spring must finish")
        now2 += 1000.0 / 60.0
        clock2.pulse(now2)
        out.check(!clock2.isRunning, "clock must idle once the last spring settles (M7)")

        /* emit: one event → one hook (motion + sound + haptic wired by the shell) */
        var seen: String? = null
        var seenDetail: Map<String, Any?>? = null
        val offEmit = NovaEmit.onEmit { kind, detail -> seen = kind; seenDetail = detail }
        NovaMotion.emit("open", mapOf("surface" to "app"))
        out.check(seen == "open", "emit listener saw $seen")
        out.check(seenDetail?.get("surface") == "app", "emit detail lost")
        out.check(NovaMotion.stats.lastTransition == "open", "stats.lastTransition must record the emit")
        offEmit()
        seen = null
        NovaMotion.emit("close")
        out.check(seen == null, "unsubscribed emit listener must stay quiet")
        out.check(NovaMotion.stats.lastTransition == "close", "stats must record emits after unsubscribe")

        /* facade */
        out.check(NovaMotion.springs.size == 6, "facade must expose all six springs")
        out.check(NovaMotion.duration("FAST") == NovaMotionConfig.token("FAST"), "facade duration must delegate to tokens")
        out.check("open" in SOUND_EVENTS && "sweep" in SOUND_EVENTS, "sound set drifted")

        return out
    }

    /* ══════ everything, for GoldenMain / one-shot CI runs ══════ */

    fun loadGolden(path: String? = null): Map<String, Any?> = GoldenJson.load(path)

    fun allFailures(g: Map<String, Any?>): List<String> =
        constantsFailures(g) +
            profileThemeFailures(g) +
            velocityFailures(g) +
            retargetFailures(g) +
            helperFailures(g) +
            physicsFailures() +
            engineFailures()
}
