/* ══════════════════════════════════════════════════════════════
   NOVA MOTION — golden curves for the Kotlin port (Phase 2)
   Regenerates the reference trajectories + constants produced by
   the JS engine. `android/app/src/test/` asserts the Kotlin port
   reproduces them sample-for-sample (docs/02 §11).
   Run:  node tools/golden-curves.mjs          (write the file)
         node tools/golden-curves.mjs --check  (fail if stale)
   ══════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GOLDEN_PATH = path.join(HERE, '..', 'android', 'app', 'src', 'test', 'resources', 'golden-curves.json');

/* same environment stubs the other checks use — config.js touches the DOM on apply */
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = {
  body: { dataset: {} },
  documentElement: { style: { setProperty() {} } },
};

const springs = await import('../prototype/src/motion/springs.js');
const { capReleaseVelocity } = await import('../prototype/src/motion/motion.js');
const config = await import('../prototype/src/motion/config.js');
const { simulate } = await import('./lib/simulate.mjs');

const PROFILES = ['cinematic', 'balanced', 'fast', 'reduced'];
const THEMES = ['aurora', 'orbit', 'liquid', 'minimal', 'neon'];

/** Traces are exact when stored as JS-number strings: parseable bit-for-bit in Kotlin too. */
const traceString = (trace) => trace.map((x) => String(x)).join(' ');

const springJson = (s) => ({ stiffness: s.stiffness, damping: s.damping, mass: s.mass });
const roundOrNull = (v) => (Number.isFinite(v) ? v : null); // JSON has no Infinity — Kotlin maps null → ∞

/** The full snapshot the Kotlin port must reproduce. */
export function renderGolden() {
  /* ── constants: the single source of truth, copied by the port ── */
  const springsConst = {};
  for (const [name, s] of Object.entries(springs.SPRINGS)) springsConst[name] = springJson(s);

  const profilesConst = {};
  for (const id of PROFILES) {
    const p = config.PROFILES[id];
    profilesConst[id] = {
      label: p.label, note: p.note,
      timeScale: p.timeScale, stagger: p.stagger, blur: p.blur, parallax: p.parallax,
      springStiff: p.springStiff, springDamp: p.springDamp, scaleMax: p.scaleMax,
      arcs: p.arcs, overshoot: p.overshoot,
      ...(p.critical ? { critical: true } : {}),
    };
  }

  const themesConst = {};
  for (const id of THEMES) {
    const t = config.THEMES[id];
    themesConst[id] = {
      label: t.label, note: t.note, spring: t.spring,
      timeScale: t.timeScale, stagger: t.stagger, overshoot: t.overshoot, arc: t.arc, blur: t.blur,
    };
  }

  const constants = {
    springs: springsConst,
    tokens: { ...config.TOKENS },
    minZeta: springs.MIN_ZETA,
    maxOvershoot: springs.MOTION_LIMITS.MAX_OVERSHOOT,
    substep: 1 / 240,
    profiles: profilesConst,
    themes: themesConst,
  };

  /* ── every profile × theme: the resolved spring + its full trajectory ── */
  const profileTheme = [];
  for (const p of PROFILES) {
    for (const th of THEMES) {
      config.setProfile(p);
      config.setTheme(th);
      const cfg = config.springConfig('theme');
      const softCfg = config.springConfig('SOFT');
      const r = simulate(cfg);
      profileTheme.push({
        profile: p, theme: th,
        cfg: springJson(cfg),
        softCfg: springJson(softCfg),
        trace: traceString(r.trace),
        overshoot: r.overshoot,
        settle: roundOrNull(r.settle),
        final: r.trace.at(-1),
        jumpedBack: r.jumpedBack,
        /* the non-spring half of the config surface */
        scaleCap: config.scaleCap(),
        usesArcs: config.usesArcs(),
        blurPx: config.blurPx(),
        parallax: config.parallax(),
        tokens: [
          config.token('FAST'), config.token('NORMAL'),
          config.token('SLOW'), config.token('LONG'),
        ],
        stagger40: config.stagger(40),
      });
    }
  }

  /* ── release-velocity budget: a flick may add energy, never break 6 % (M2) ── */
  config.setProfile('balanced');
  const velocity = [];
  for (const th of ['liquid', 'orbit', 'aurora', 'minimal', 'neon']) {
    config.setTheme(th);
    const cfg = config.springConfig('theme');
    for (const v of [400, 1200, 2400, 4000, 8000]) {
      const velocityIn = v / 400;
      const velocityCapped = capReleaseVelocity({ from: 0, to: 1, cfg, velocity: velocityIn });
      const r = simulate(cfg, { velocity: velocityCapped });
      velocity.push({
        theme: th, velocityIn, velocityCapped,
        cfg: springJson(cfg),
        trace: traceString(r.trace),
        overshoot: r.overshoot,
        settle: roundOrNull(r.settle),
      });
    }
  }

  /* ── re-target mid-flight: single settle, no visual jump (M6) ── */
  config.setProfile('balanced');
  config.setTheme('neon');
  const rtCfg = config.springConfig('SOFT');
  const rt = simulate(rtCfg, { retarget: { at: 0.15, to: 0, velocity: -3 } });
  const maxStep = Math.max(...rt.trace.map((x, i) => (i ? Math.abs(x - rt.trace[i - 1]) : 0)));
  const retarget = {
    profile: 'balanced', theme: 'neon',
    cfg: springJson(rtCfg),
    at: 0.15, to: 0, velocity: -3,
    trace: traceString(rt.trace),
    settle: roundOrNull(rt.settle),
    maxStep,
    jumpedBack: rt.jumpedBack,
  };

  /* ── helpers: the guards themselves ── */
  const wild = springs.capOvershoot({ stiffness: 400, damping: 4, mass: 1 });
  const wildSim = simulate(wild);
  const crit = springs.criticallyDamped({ stiffness: 200, damping: 5, mass: 1.2 });
  const helpers = {
    capOvershootWild: { input: { stiffness: 400, damping: 4, mass: 1 }, cfg: springJson(wild), dampingRatio: springs.dampingRatio(wild), overshoot: wildSim.overshoot },
    criticallyDamped: { input: { stiffness: 200, damping: 5, mass: 1.2 }, cfg: springJson(crit), dampingRatio: springs.dampingRatio(crit) },
    settleThresholds: [1, 0, 600, 0.001].map((travel) => {
      const th = springs.settleThresholds(travel);
      return { travel, settleX: th.settleX, settleV: th.settleV };
    }),
    perSpring: Object.fromEntries(Object.entries(springs.SPRINGS).map(([name, cfg]) => [name, {
      dampingRatio: springs.dampingRatio(cfg),
      overshoot: springs.overshootOf(cfg),
    }])),
  };

  return {
    meta: {
      source: 'prototype/src/motion',
      engine: 'springs.js + config.js + motion.js',
      dt: 1 / 60,
      maxT: 3.0,
      producedBy: 'tools/golden-curves.mjs',
    },
    constants,
    profileTheme,
    velocity,
    retarget,
    helpers,
  };
}

export function goldenText() {
  return JSON.stringify(renderGolden(), null, 1) + '\n';
}

/* write / --check */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const fresh = goldenText();
  if (process.argv.includes('--check')) {
    const onDisk = fs.existsSync(GOLDEN_PATH) ? fs.readFileSync(GOLDEN_PATH, 'utf8') : '';
    if (onDisk !== fresh) {
      console.error('✗ golden-curves.json is stale — run: node tools/golden-curves.mjs');
      process.exit(1);
    }
    console.log('✓ golden-curves.json matches the JS engine');
  } else {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, fresh);
    const g = JSON.parse(fresh);
    const bytes = Buffer.byteLength(fresh);
    console.log(`golden-curves.json written — ${g.profileTheme.length} profile×theme curves, ` +
      `${g.velocity.length} velocity curves, ${(bytes / 1024).toFixed(0)} KB`);
  }
}
