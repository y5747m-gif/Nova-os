package os.nova.motion

import org.junit.Test
import org.junit.Assert

/**
 * NOVA MOTION physics + engine behaviour — golden-independent
 * (docs/02 §3 settle rules, §9 engine API, M6 interruptibility, M8 emit).
 * Shared with `GoldenMain` in [NovaChecks].
 */
class NovaSpringTest {

    @Test
    fun springsSettleByTravelThresholdsAndGuards() {
        val failures = NovaChecks.physicsFailures()
        Assert.assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun engineToolboxBehavesLikeTheWebReference() {
        val failures = NovaChecks.engineFailures()
        Assert.assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }
}
