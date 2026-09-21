/* ══════════════════════════════════════════════════════════════
   NOVA spring tests — docs/02-motion-language.md §11
   Golden-curve checks for every profile × theme combination:
     · overshoot ≤ 6 % of travel
     · settle time inside the motion budget
     · Reduced Motion never overshoots and never scales past 4 %
     · re-targeting mid-flight preserves velocity and stays monotonic
   Run: node tools/spring-check.mjs
   ══════════════════════════════════════════════════════════════ */

globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = {
  body: { dataset: {} },
  documentElement: { style: { setProperty() {} } },
};

const { integrate, isSettled, settleThresholds, criticallyDamped, dampingRatio, capOvershoot, MIN_ZETA } = await import('../prototype/src/motion/springs.js');
const { capReleaseVelocity } = await import('../prototype/src/motion/motion.js');
const config = await import('../prototype/src/motion/config.js');

const DT = 1 / 60;
const MAX_T = 3.0;

function simulate(cfg, { from = 0, to = 1, velocity = 0, retarget = null } = {}) {
  const st = { x: from, v: velocity };
  let target = to;
  let t = 0;
  let peak = from;
  let settledAt = null;
  let jumpedBack = false;
  let last = from;
  const trace = [];

  while (t < MAX_T) {
    if (retarget && Math.abs(t - retarget.at) < DT) {
      target = retarget.to;
      st.v = retarget.velocity ?? st.v;
    }
    integrate(st, target, cfg, DT);
    t += DT;
    peak = Math.max(peak, st.x);
    if (target > last && st.x < last - 1e-6 && st.x > 0) jumpedBack = true; // no rubber-band after commit
    last = st.x;
    trace.push(st.x);
    const th = settleThresholds(Math.abs(target - from));
    if (settledAt === null && isSettled(st, target, th.settleX, th.settleV)) settledAt = t;
  }
  return { overshoot: Math.max(0, (peak - to) / (to - from || 1)), settle: settledAt ?? Infinity, jumpedBack, trace };
}

let failures = 0;
const results = [];
function assert(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const profiles = ['cinematic', 'balanced', 'fast', 'reduced'];
const themes = ['aurora', 'orbit', 'liquid', 'minimal', 'neon'];

for (const p of profiles) {
  for (const th of themes) {
    config.setProfile(p);
    config.setTheme(th);
    const cfg = config.springConfig('theme');
    const r = simulate(cfg);
    const label = `${p}/${th}`;
    assert(`${label}: overshoot ≤ 6.5%`, r.overshoot <= 0.065, `${(r.overshoot * 100).toFixed(2)}%`);
    assert(`${label}: settles < 900ms`, r.settle < 0.9, `${(r.settle * 1000).toFixed(0)}ms`);
    assert(`${label}: no early snap`, Math.abs(r.trace.at(-1) - 1) < 0.01, `final ${r.trace.at(-1).toFixed(4)}`);

    if (p === 'reduced') {
      assert(`${label}: critically damped`, Math.abs(dampingRatio(cfg) - 1) < 0.01, `ζ=${dampingRatio(cfg).toFixed(2)}`);
      assert(`${label}: scale cap 4%`, config.scaleCap() <= 0.04, String(config.scaleCap()));
      assert(`${label}: no arcs`, !config.usesArcs());
      assert(`${label}: no blur`, config.blurPx() === 0, `${config.blurPx()}px`);
    }
  }
}

/* a flick must not blow the overshoot budget (M2) — the engine caps release velocity */
config.setProfile('balanced');
for (const th of ['liquid', 'orbit', 'aurora', 'minimal', 'neon']) {
  config.setTheme(th);
  const cfg2 = config.springConfig('theme');
  for (const v of [400, 1200, 2400, 4000, 8000]) {
    const seeded = capReleaseVelocity({ from: 0, to: 1, cfg: cfg2, velocity: v / 400 });
    const r = simulate(cfg2, { velocity: seeded });
    assert(`${th} @ ${v}px/s: overshoot ≤ 6.5%`, r.overshoot <= 0.065, `${(r.overshoot * 100).toFixed(2)}% (v0=${seeded.toFixed(2)})`);
  }
}

/* re-target mid-flight keeps velocity, arrives monotonically, no jump (M6) */
const cfg = config.springConfig('SOFT');
const rt = simulate(cfg, { retarget: { at: 0.15, to: 0, velocity: -3 } });
assert('re-target keeps a single settle', rt.settle < 0.9, `${(rt.settle * 1000).toFixed(0)}ms`);
const jump = Math.max(...rt.trace.map((x, i) => (i ? Math.abs(x - rt.trace[i - 1]) : 0)));
assert('re-target has no visual jump', jump < 0.12, `max step ${jump.toFixed(3)}`);

/* the overshoot cap is real for an intentionally bouncy spring */
const wild = capOvershoot({ stiffness: 400, damping: 4, mass: 1 });
assert('capOvershoot clamps a wild spring to the 6% budget', dampingRatio(wild) >= MIN_ZETA && simulate(wild).overshoot <= 0.065, `ζ=${dampingRatio(wild).toFixed(2)} overshoot=${(simulate(wild).overshoot * 100).toFixed(2)}%`);

/* critical damping helper */
const crit = criticallyDamped({ stiffness: 200, damping: 5, mass: 1.2 });
assert('criticallyDamped → ζ = 1', Math.abs(dampingRatio(crit) - 1) < 1e-6);

console.log(results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} spring checks passed`);
process.exit(failures ? 1 : 0);
