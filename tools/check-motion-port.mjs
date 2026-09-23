/* ══════════════════════════════════════════════════════════════
   NOVA shipping gate — Kotlin port parity (Phase 2)
   Proves without needing a JVM:
     · golden-curves.json is fresh (regenerating it is a no-op),
     · the Kotlin sources copy the right constants (springs, tokens,
       ζ/overshoot/substep guards), straight from the JS engine,
     · the JVM test suite + its wiring exist (JUnit dep, CI step,
       golden file referenced by the tests).
   The actual curve replay runs in CI: gradle testDebugUnitTest
   (and locally: GoldenMain / the JUnit suite).
   Run: node tools/check-motion-port.mjs
   ══════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN_PATH, goldenText } from './golden-curves.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

let failures = 0;
const results = [];
function assert(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const MOTION_DIR = path.join(ROOT, 'android/app/src/main/java/os/nova/motion');
const TEST_DIR = path.join(ROOT, 'android/app/src/test/java/os/nova/motion');

/* ── the golden file is fresh ─────────────────────────────────── */
{
  const fresh = goldenText();
  const onDisk = fs.existsSync(GOLDEN_PATH) ? fs.readFileSync(GOLDEN_PATH, 'utf8') : '';
  assert('golden-curves.json matches the JS engine', onDisk === fresh,
    onDisk === fresh ? 'byte-identical' : 'stale — run: node tools/golden-curves.mjs');
  let parsed = null;
  try { parsed = JSON.parse(onDisk); } catch { /* reported below */ }
  assert('golden-curves.json parses as JSON', !!parsed);
  if (parsed) {
    assert('20 profile × theme curves + 25 velocity curves',
      parsed.profileTheme?.length === 20 && parsed.velocity?.length === 20 + 5,
      `${parsed.profileTheme?.length}+${parsed.velocity?.length}`);
    assert('every curve carries a full 60 Hz trace (181 samples over 3 s)',
      parsed.profileTheme.every((c) => typeof c.trace === 'string' && c.trace.split(' ').length >= 180) &&
      parsed.velocity.every((c) => typeof c.trace === 'string' && c.trace.split(' ').length >= 180),
      `${parsed.profileTheme[0].trace.split(' ').length} samples/case`);
  }
}

/* ── the Kotlin module exists (the Phase 2 port) ─────────────── */
const files = {
  spring: path.join(MOTION_DIR, 'NovaSpring.kt'),
  config: path.join(MOTION_DIR, 'NovaMotionConfig.kt'),
  engine: path.join(MOTION_DIR, 'NovaMotion.kt'),
  goldenTest: path.join(TEST_DIR, 'NovaMotionGoldenTest.kt'),
  springTest: path.join(TEST_DIR, 'NovaSpringTest.kt'),
  checks: path.join(TEST_DIR, 'NovaChecks.kt'),
  json: path.join(TEST_DIR, 'GoldenJson.kt'),
  main: path.join(TEST_DIR, 'GoldenMain.kt'),
  resources: path.join(ROOT, 'android/app/src/test/resources/golden-curves.json'),
};
for (const [name, p] of Object.entries(files)) {
  assert(`port file exists: ${path.relative(ROOT, p)}`, fs.existsSync(p));
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const springKt = read(files.spring);
const configKt = read(files.config);
const engineKt = read(files.engine);
const checksKt = read(files.checks);
const goldenTestKt = read(files.goldenTest);
const buildGradle = read(path.join(ROOT, 'android/app/build.gradle'));
const apkWorkflow = read(path.join(ROOT, '.github/workflows/apk.yml'));

/* ── constants parity: Kotlin copies the JS engine ───────────── */
{
  // JS side — the reference (this tool imports the engine via golden-curves)
  const { goldenText: _g } = {};
  const meta = JSON.parse(goldenText()).constants;

  // Kotlin springs: `val SOFT = NovaSpring(180.0, 22.0, 1.0)`
  const springRe = /val\s+([A-Z]+)\s*=\s*NovaSpring\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g;
  const ktSprings = {};
  let m;
  while ((m = springRe.exec(springKt)) !== null) {
    ktSprings[m[1]] = { stiffness: Number(m[2]), damping: Number(m[3]), mass: Number(m[4]) };
  }
  for (const [name, want] of Object.entries(meta.springs)) {
    const got = ktSprings[name];
    const ok = got && got.stiffness === want.stiffness && got.damping === want.damping && got.mass === want.mass;
    assert(`Kotlin spring ${name} == JS springs.js`, !!ok,
      got ? JSON.stringify(got) : 'missing in NovaSpring.kt');
  }

  // Guard constants
  const numConst = (src, name) => {
    const r = new RegExp(`const\\s+val\\s+${name}\\s*=\\s*([\\d.]+)`);
    const mm = src.match(r);
    return mm ? Number(mm[1]) : NaN;
  };
  assert('Kotlin MIN_ZETA == JS MIN_ZETA', numConst(springKt, 'MIN_ZETA') === meta.minZeta,
    String(numConst(springKt, 'MIN_ZETA')));
  assert('Kotlin MAX_OVERSHOOT == JS budget', numConst(springKt, 'MAX_OVERSHOOT') === meta.maxOvershoot,
    String(numConst(springKt, 'MAX_OVERSHOOT')));
  assert('Kotlin SUBSTEP == 1/240', /const\s+val\s+SUBSTEP\s*=\s*1\.0\s*\/\s*240\.0/.test(springKt));

  // Time tokens
  for (const [name, want] of Object.entries(meta.tokens)) {
    const r = new RegExp(`const\\s+val\\s+TOKEN_${name}\\s*=\\s*(\\d+)`);
    const mm = configKt.match(r);
    assert(`Kotlin TOKEN_${name} == ${want}`, !!mm && Number(mm[1]) === want, mm ? mm[1] : 'missing');
  }

  // Engine surface — the ports the Compose shell will call
  for (const symbol of [
    'fun integrate(', 'fun settleThresholds(', 'fun capOvershoot(', 'fun criticallyDamped(',
    'fun overshootOf(', 'fun dampingRatio(',
  ]) {
    assert(`NovaSpring.kt exports ${symbol.slice(0, symbol.length - 1)}`, springKt.includes(symbol));
  }
  for (const symbol of [
    'fun springConfig(', 'fun duration(', 'fun token(', 'fun stagger(', 'fun blurPx(',
    'fun usesArcs(', 'fun scaleCap(', 'object NovaMotionConfig',
    '"cinematic"', '"balanced"', '"fast"', '"reduced"',
    '"aurora"', '"orbit"', '"liquid"', '"minimal"', '"neon"',
  ]) {
    assert(`NovaMotionConfig.kt has ${symbol}`, configKt.includes(symbol));
  }
  for (const symbol of [
    'class SpringAnimation', 'class FrameClock', 'class MorphPlan', 'class PanelMotion',
    'class OrbitalMotion', 'class CascadeMotion', 'class DepthMotion',
    'fun capReleaseVelocity(', 'object NovaMotion', 'fun emit(',
  ]) {
    assert(`NovaMotion.kt has ${symbol}`, engineKt.includes(symbol));
  }
}

/* ── the JVM test suite is wired ──────────────────────────────── */
{
  assert('NovaChecks replays golden traces (simulate + TRACE_TOL)',
    checksKt.includes('fun simulate(') && checksKt.includes('TRACE_TOL'));
  assert('NovaChecks covers constants / curves / velocity / retarget / helpers / physics / engine',
    ['constantsFailures', 'profileThemeFailures', 'velocityFailures', 'retargetFailures',
      'helperFailures', 'physicsFailures', 'engineFailures'].every((f) => checksKt.includes(f)));
  assert('golden test references golden-curves.json', goldenTestKt.includes('NovaChecks') &&
    (goldenTestKt.includes('golden') || read(files.checks).includes('golden-curves.json')));
  assert('JUnit tests declared', (goldenTestKt.match(/@Test/g) || []).length >= 5 &&
    read(files.springTest).includes('@Test'));
  assert('JUnit dependency in app/build.gradle',
    /testImplementation\s+['"]junit:junit:4\.13\.2['"]/.test(buildGradle));
  assert('CI runs testDebugUnitTest before building the APK',
    apkWorkflow.includes('testDebugUnitTest'));
  assert('standalone GoldenMain exists (no-JUnit runner)', read(files.main).includes('fun main('));
}

console.log('NOVA motion-port gate — tools/check-motion-port.mjs');
console.log('──────────────────────────────────────────────────────');
console.log(results.join('\n'));
console.log('──────────────────────────────────────────────────────');
console.log(`${results.length - failures}/${results.length} port checks passed`);
process.exit(failures ? 1 : 0);
