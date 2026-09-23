package os.nova.motion

import kotlin.system.exitProcess

/**
 * Standalone runner for [NovaChecks] — the whole Kotlin-port suite without
 * needing JUnit (handy locally, and a second opinion in CI):
 *
 *   java -cp classes os.nova.motion.GoldenMain [path/to/golden-curves.json]
 *
 * Exit code 0 = every assertion holds; 1 = the port drifted from the JS engine.
 */
fun main(args: Array<String>) {
    val golden = NovaChecks.loadGolden(args.getOrNull(0))
    val failures = NovaChecks.allFailures(golden)

    if (failures.isEmpty()) {
        println("PASS  Kotlin NovaMotion reproduces the JS golden curves + budgets")
        println("PASS  physics guards (settle, velocity cap, interruptible springs)")
        println("PASS  engine (morph, panel, orbital, cascade, depth, clock, emit)")
        println("OK    NovaChecks — all assertions passed")
        exitProcess(0)
    }

    for (f in failures) println("FAIL  $f")
    println("NovaChecks — ${failures.size} failure(s)")
    exitProcess(1)
}
