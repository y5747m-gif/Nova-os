package os.nova.motion

import kotlin.math.max

/**
 * NOVA MOTION — tokens, profiles, themes (docs/02 §2 / §7 / §8).
 * The Kotlin port of `prototype/src/motion/config.js`.
 *
 * Duration is a fallback for non-spatial changes (M4); springs are the
 * real control. Profiles change performance behaviour, themes change
 * character — both feed [springConfig], [duration], [stagger], [blurPx].
 *
 * State lives in memory; the shell persists a [ConfigSnapshot] wherever
 * it likes (SharedPreferences on Android, like `nova.config.v1` on web).
 */
object NovaMotionConfig {

    /* ── time tokens (docs/02 §2) ─────────────────────────────── */
    const val TOKEN_FAST = 160
    const val TOKEN_NORMAL = 320
    const val TOKEN_SLOW = 480
    const val TOKEN_LONG = 650

    val TOKENS: Map<String, Int> = mapOf(
        "FAST" to TOKEN_FAST,
        "NORMAL" to TOKEN_NORMAL,
        "SLOW" to TOKEN_SLOW,
        "LONG" to TOKEN_LONG,
    )

    /* ── profiles (docs/02 §7) ────────────────────────────────── */

    enum class OvershootPolicy { FULL, NONE }

    data class Profile(
        val id: String,
        val label: String,
        val note: String,
        val timeScale: Double,
        val stagger: Double,
        val blur: Double,
        val parallax: Double,
        val springStiff: Double,
        val springDamp: Double,
        val scaleMax: Double,
        val arcs: Boolean,
        val overshoot: OvershootPolicy,
        val critical: Boolean = false,
    )

    val PROFILES: Map<String, Profile> = listOf(
        Profile(
            "cinematic", "Cinematic",
            "الحركة الكاملة: أقواس، عمق، بارالاكس، وتتابع واضح.",
            timeScale = 1.0, stagger = 40.0, blur = 12.0, parallax = 1.0,
            springStiff = 1.0, springDamp = 1.0, scaleMax = 1.0,
            arcs = true, overshoot = OvershootPolicy.FULL,
        ),
        Profile(
            "balanced", "Balanced",
            "الافتراضي: نفس الفيزياء بحركة أقصر وتتابع أقل.",
            timeScale = 0.85, stagger = 24.0, blur = 8.0, parallax = 0.5,
            springStiff = 1.1, springDamp = 1.02, scaleMax = 1.0,
            arcs = true, overshoot = OvershootPolicy.FULL,
        ),
        Profile(
            "fast", "Fast",
            "أسرع وأكثر صلابة: مفيش أقواس ولا overshoot ولا blur.",
            timeScale = 0.55, stagger = 0.0, blur = 0.0, parallax = 0.0,
            springStiff = 1.45, springDamp = 1.25, scaleMax = 1.0,
            arcs = false, overshoot = OvershootPolicy.NONE,
        ),
        Profile(
            "reduced", "Reduced Motion",
            "مخصص لإمكانية الوصول: تلاشي فقط، بدون تكبير أو بارالاكس أو حركة مصاحبة.",
            timeScale = 0.35, stagger = 0.0, blur = 0.0, parallax = 0.0,
            springStiff = 1.2, springDamp = 2.4, scaleMax = 0.04,
            arcs = false, overshoot = OvershootPolicy.NONE, critical = true,
        ),
    ).associateBy { it.id }

    /* ── themes (docs/02 §8) — behaviour, not colour ──────────── */

    data class Theme(
        val id: String,
        val label: String,
        val note: String,
        val spring: String,
        val timeScale: Double,
        val stagger: Double,
        val overshoot: Double,
        val arc: Double,
        val blur: Double,
    )

    val THEMES: Map<String, Theme> = listOf(
        Theme(
            "aurora", "Aurora",
            "ناعم وواسع: SOft springs، مدد أطول، تلاشي هادئ.",
            spring = "SOFT", timeScale = 1.1, stagger = 56.0,
            overshoot = 0.02, arc = 0.45, blur = 1.1,
        ),
        Theme(
            "orbit", "Orbit",
            "دائري: كل العناصر توصل على قوس حول مركز.",
            spring = "ORBIT", timeScale = 1.0, stagger = 48.0,
            overshoot = 0.05, arc = 1.0, blur = 1.0,
        ),
        Theme(
            "liquid", "Liquid",
            "مرن: overshoot أكبر واستقرار متأخر (بحد أقصى 6%).",
            spring = "LIQUID", timeScale = 1.05, stagger = 44.0,
            overshoot = 0.06, arc = 0.5, blur = 1.15,
        ),
        Theme(
            "minimal", "Minimal",
            "شبه ساكن: بدون قوس ولا ارتداد، مدد قصيرة.",
            spring = "SNAP", timeScale = 0.6, stagger = 0.0,
            overshoot = 0.0, arc = 0.0, blur = 0.0,
        ),
        Theme(
            "neon", "Neon",
            "سريع ولامع: SNAP springs ولمعة لحظية عند الالتقاط.",
            spring = "SNAP", timeScale = 0.75, stagger = 28.0,
            overshoot = 0.03, arc = 0.6, blur = 0.7,
        ),
    ).associateBy { it.id }

    /* ── live configuration ───────────────────────────────────── */

    const val DEFAULT_PROFILE = "balanced"
    const val DEFAULT_THEME = "aurora"

    var profileId: String = DEFAULT_PROFILE
        private set
    var themeId: String = DEFAULT_THEME
        private set

    /** The OS accessibility flag — surfaces honour it even on a spring profile. */
    var reduceSystem: Boolean = false

    fun setProfile(name: String) {
        if (PROFILES.containsKey(name)) profileId = name
    }

    fun setTheme(name: String) {
        if (THEMES.containsKey(name)) themeId = name
    }

    fun profile(): Profile = PROFILES[profileId] ?: PROFILES.getValue(DEFAULT_PROFILE)
    fun theme(): Theme = THEMES[themeId] ?: THEMES.getValue(DEFAULT_THEME)

    /** For the shell to persist / restore — the Kotlin twin of `nova.config.v1`. */
    data class ConfigSnapshot(val profile: String, val theme: String)

    fun snapshot(): ConfigSnapshot = ConfigSnapshot(profileId, themeId)

    fun restore(snapshot: ConfigSnapshot) {
        setProfile(snapshot.profile)
        setTheme(snapshot.theme)
    }

    /** Reduced Motion is active when the profile says so or the OS does. */
    fun effectiveReduced(): Boolean = profileId == "reduced" || reduceSystem

    /* ── resolution ───────────────────────────────────────────── */

    /**
     * Effective spring for a named config, after theme + profile adjustment.
     * `name == "theme"` picks the theme's signature spring.
     * Mirrors `springConfig()` in config.js branch-for-branch.
     */
    fun springConfig(name: String = "SOFT"): NovaSpring {
        val th = theme()
        val pr = profile()
        val key = if (th.spring.isNotEmpty() && name == "theme") th.spring else name
        val base = Springs.ALL[key] ?: Springs.ALL[name] ?: Springs.SOFT
        var cfg = NovaSpring(
            stiffness = base.stiffness * pr.springStiff,
            damping = base.damping * pr.springDamp,
            mass = base.mass,
        )
        if (pr.critical) cfg = criticallyDamped(cfg)
        if (pr.overshoot == OvershootPolicy.NONE || th.overshoot == 0.0) {
            cfg = criticallyDamped(cfg)
        }
        if (pr.overshoot == OvershootPolicy.FULL && th.overshoot > 0.0) {
            cfg = capOvershoot(cfg)
        }
        return cfg
    }

    /** The theme's signature spring (when a surface says "use the theme"). */
    fun themeSpring(): NovaSpring = springConfig("theme")

    /** JS `Math.round` — half away from +∞, matching `Math.round` on our positives. */
    internal fun jsRound(x: Double): Double = kotlin.math.floor(x + 0.5)

    /** Scale a time token by profile + theme (ms); non-spatial fallback only (M4). */
    fun duration(base: Double = 320.0): Int {
        val ms = base * profile().timeScale * theme().timeScale
        return max(60.0, jsRound(ms)).toInt()
    }

    fun token(name: String = "NORMAL"): Int = duration((TOKENS[name] ?: TOKEN_NORMAL).toDouble())

    /** Stagger between siblings (ms). */
    fun stagger(base: Double? = null): Int {
        val b = base ?: 40.0
        val v = b * profile().stagger / 40.0 * (theme().stagger / 40.0)
        return jsRound(v).toInt()
    }

    /** Live blur budget in px (0 in Fast / Reduced Motion). */
    fun blurPx(): Int = jsRound(profile().blur * theme().blur).toInt()

    fun parallax(): Double = profile().parallax

    fun usesArcs(): Boolean = profile().arcs && theme().arc > 0.0

    fun arcBias(): Double = theme().arc

    /** Reduced Motion never scales past 4 %. */
    fun scaleCap(): Double = profile().scaleMax

    /** Current overshoot estimate, for telemetry/deck readouts. */
    fun currentOvershoot(): Double {
        val cfg = springConfig("theme")
        val z = dampingRatio(cfg)
        return if (z >= 1.0) 0.0 else overshootOf(cfg)
    }
}
