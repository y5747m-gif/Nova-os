package os.nova.motion

import java.io.File

/**
 * Minimal JSON reader for `golden-curves.json` — test sources only, no
 * dependencies (unit tests must run on a bare JVM). Just enough for the
 * golden file: objects, arrays, strings (incl. unicode escapes), doubles,
 * booleans, null.
 */
internal object GoldenJson {

    fun parse(text: String): Any? {
        val p = Parser(text)
        val v = p.value()
        p.ws()
        require(p.done()) { "trailing JSON content at ${p.pos}" }
        return v
    }

    private class Parser(private val s: String) {
        var pos: Int = 0
            private set

        fun done(): Boolean = pos >= s.length

        fun ws() {
            while (pos < s.length && s[pos].isWhitespace()) pos++
        }

        private fun peek(): Char {
            require(pos < s.length) { "unexpected end of JSON" }
            return s[pos]
        }

        private fun next(): Char = peek().also { pos++ }

        private fun expect(c: Char) {
            require(next() == c) { "expected '$c' at $pos" }
        }

        fun value(): Any? {
            ws()
            return when (peek()) {
                '{' -> obj()
                '[' -> arr()
                '"' -> str()
                't' -> lit("true", true)
                'f' -> lit("false", false)
                'n' -> lit("null", null)
                else -> num()
            }
        }

        private fun lit(word: String, v: Any?): Any? {
            require(s.regionMatches(pos, word, 0, word.length)) { "bad literal at $pos" }
            pos += word.length
            return v
        }

        private fun obj(): Map<String, Any?> {
            expect('{')
            val out = LinkedHashMap<String, Any?>()
            ws()
            if (peek() == '}') { pos++; return out }
            while (true) {
                ws()
                val k = str()
                ws()
                expect(':')
                out[k] = value()
                ws()
                when (next()) {
                    ',' -> continue
                    '}' -> return out
                    else -> throw IllegalArgumentException("bad object at $pos")
                }
            }
        }

        private fun arr(): List<Any?> {
            expect('[')
            val out = ArrayList<Any?>()
            ws()
            if (peek() == ']') { pos++; return out }
            while (true) {
                out.add(value())
                ws()
                when (next()) {
                    ',' -> continue
                    ']' -> return out
                    else -> throw IllegalArgumentException("bad array at $pos")
                }
            }
        }

        private fun str(): String {
            expect('"')
            val sb = StringBuilder()
            while (true) {
                when (val c = next()) {
                    '"' -> return sb.toString()
                    '\\' -> when (val e = next()) {
                        '"' -> sb.append('"')
                        '\\' -> sb.append('\\')
                        '/' -> sb.append('/')
                        'b' -> sb.append('\b')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'f' -> sb.append(0x0C.toChar())
                        'u' -> {
                            val hex = s.substring(pos, pos + 4)
                            pos += 4
                            sb.append(hex.toInt(16).toChar())
                        }
                        else -> throw IllegalArgumentException("bad escape at $pos")
                    }
                    else -> sb.append(c)
                }
            }
        }

        private fun num(): Double {
            val start = pos
            while (pos < s.length && (s[pos].isDigit() || s[pos] == '-' || s[pos] == '+' || s[pos] == '.' || s[pos] == 'e' || s[pos] == 'E')) pos++
            require(pos > start) { "bad number at $start" }
            return s.substring(start, pos).toDouble()
        }
    }

    /* ── typed accessors over the parsed tree ─────────────────── */

    fun map(v: Any?): Map<String, Any?> {
        @Suppress("UNCHECKED_CAST")
        return v as Map<String, Any?>
    }

    fun list(v: Any?): List<Any?> {
        @Suppress("UNCHECKED_CAST")
        return v as List<Any?>
    }

    fun Map<String, Any?>.obj(k: String): Map<String, Any?> = map(get(k))
    fun Map<String, Any?>.arr(k: String): List<Any?> = list(get(k))
    fun Map<String, Any?>.num(k: String): Double = get(k) as Double
    fun Map<String, Any?>.str(k: String): String = get(k) as String
    fun Map<String, Any?>.bool(k: String): Boolean = get(k) as Boolean
    fun Map<String, Any?>.boolOr(k: String, fallback: Boolean): Boolean = get(k) as? Boolean ?: fallback
    fun Map<String, Any?>.numOrNull(k: String): Double? = get(k) as? Double

    /** Traces are stored as space-separated JS-number strings (exact round-trip). */
    fun trace(s: String): DoubleArray =
        if (s.isEmpty()) DoubleArray(0) else s.split(' ').map { it.toDouble() }.toDoubleArray()

    fun spring(m: Map<String, Any?>): NovaSpring =
        NovaSpring(m.num("stiffness"), m.num("damping"), m.num("mass"))

    /**
     * Load the golden file: classpath first (Gradle unit tests), then the
     * usual repo-relative paths for a standalone `GoldenMain` run.
     */
    fun load(explicitPath: String? = null): Map<String, Any?> {
        if (explicitPath != null) {
            return map(parse(File(explicitPath).readText()))
        }
        val stream = GoldenJson::class.java.classLoader.getResourceAsStream("golden-curves.json")
        if (stream != null) {
            return stream.use { map(parse(it.readBytes().toString(Charsets.UTF_8))) }
        }
        val candidates = listOf(
            "android/app/src/test/resources/golden-curves.json",
            "app/src/test/resources/golden-curves.json",
            "src/test/resources/golden-curves.json",
        )
        for (c in candidates) {
            val f = File(c)
            if (f.isFile) return map(parse(f.readText()))
        }
        throw IllegalStateException(
            "golden-curves.json not found (classpath, ${candidates.joinToString()}) — " +
                "run: node tools/golden-curves.mjs",
        )
    }
}
