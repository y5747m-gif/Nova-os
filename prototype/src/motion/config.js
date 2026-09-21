/* ══════════════════════════════════════════════════════════════
   NOVA MOTION — tokens, profiles, themes
   The single source of truth for "how fast / how springy / how deep".
   ══════════════════════════════════════════════════════════════ */

import { SPRINGS, criticallyDamped, capOvershoot, dampingRatio, overshootOf } from './springs.js';

/* ── time tokens (docs/02 §2) — a fallback for non-spatial changes ── */
export const TOKENS = {
  FAST: 160,
  NORMAL: 320,
  SLOW: 480,
  LONG: 650,
};

/* ── motion profiles (docs/02 §7) ─────────────────────────────────── */
export const PROFILES = {
  cinematic: {
    label: 'Cinematic',
    note: 'الحركة الكاملة: أقواس، عمق، بارالاكس، وتتابع واضح.',
    timeScale: 1.0, stagger: 40, blur: 12, parallax: 1,
    springStiff: 1, springDamp: 1, scaleMax: 1.0, arcs: true, overshoot: 'full',
  },
  balanced: {
    label: 'Balanced',
    note: 'الافتراضي: نفس الفيزياء بحركة أقصر وتتابع أقل.',
    timeScale: 0.85, stagger: 24, blur: 8, parallax: .5,
    springStiff: 1.1, springDamp: 1.02, scaleMax: 1.0, arcs: true, overshoot: 'full',
  },
  fast: {
    label: 'Fast',
    note: 'أسرع وأكثر صلابة: مفيش أقواس ولا overshoot ولا blur.',
    timeScale: 0.55, stagger: 0, blur: 0, parallax: 0,
    springStiff: 1.45, springDamp: 1.25, scaleMax: 1.0, arcs: false, overshoot: 'none',
  },
  reduced: {
    label: 'Reduced Motion',
    note: 'مخصص لإمكانية الوصول: تلاشي فقط، بدون تكبير أو بارالاكس أو حركة مصاحبة.',
    timeScale: 0.35, stagger: 0, blur: 0, parallax: 0,
    springStiff: 1.2, springDamp: 2.4, scaleMax: 0.04, arcs: false, overshoot: 'none', critical: true,
  },
};

/* ── motion themes (docs/02 §8) — behaviour, not color ────────────── */
export const THEMES = {
  aurora: {
    label: 'Aurora',
    note: 'ناعم وواسع: SOft springs، مدد أطول، تلاشي هادئ.',
    spring: 'SOFT', timeScale: 1.1, stagger: 56, overshoot: .02, arc: .45, blur: 1.1,
  },
  orbit: {
    label: 'Orbit',
    note: 'دائري: كل العناصر توصل على قوس حول مركز.',
    spring: 'ORBIT', timeScale: 1.0, stagger: 48, overshoot: .05, arc: 1.0, blur: 1,
  },
  liquid: {
    label: 'Liquid',
    note: 'مرن: overshoot أكبر واستقرار متأخر (بحد أقصى 6%).',
    spring: 'LIQUID', timeScale: 1.05, stagger: 44, overshoot: .06, arc: .5, blur: 1.15,
  },
  minimal: {
    label: 'Minimal',
    note: 'شبه ساكن: بدون قوس ولا ارتداد، مدد قصيرة.',
    spring: 'SNAP', timeScale: .6, stagger: 0, overshoot: 0, arc: 0, blur: 0,
  },
  neon: {
    label: 'Neon',
    note: 'سريع ولامع: SNAP springs ولمعة لحظية عند الالتقاط.',
    spring: 'SNAP', timeScale: .75, stagger: 28, overshoot: .03, arc: .6, blur: .7,
  },
};

export const ACCENTS = {
  violet: { label: 'Nova Violet', accent: '#6c5ce7', accent2: '#22d3ee' },
  aurora: { label: 'Aurora', accent: '#4ade80', accent2: '#a78bfa' },
  orbit:  { label: 'Orbit',  accent: '#f5a524', accent2: '#6c5ce7' },
  liquid: { label: 'Liquid', accent: '#22d3ee', accent2: '#ff6b9a' },
  neon:   { label: 'Neon',   accent: '#ff3d81', accent2: '#00e5ff' },
};

/* ── live configuration ──────────────────────────────────────────── */
export const nova = {
  profile: 'balanced',
  theme: 'aurora',
  mode: 'dark',
  accent: 'violet',
  reduceSystem: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
};

const listeners = new Set();
export function onConfigChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setProfile(name) { nova.profile = name; applyConfig(); }
export function setTheme(name) { nova.theme = name; applyConfig(); }
export function setMode(name) { nova.mode = name; applyConfig(); }
export function setAccent(name) { nova.accent = name; applyConfig(); }

export function profile() { return PROFILES[nova.profile] || PROFILES.balanced; }
export function theme() { return THEMES[nova.theme] || THEMES.aurora; }

/** Effective spring for a named config, after theme + profile adjustment. */
export function springConfig(name = 'SOFT') {
  const th = theme();
  const pr = profile();
  const base = SPRINGS[th.spring && name === 'theme' ? th.spring : name] || SPRINGS[name] || SPRINGS.SOFT;
  let cfg = { ...base, stiffness: base.stiffness * pr.springStiff, damping: base.damping * pr.springDamp };

  if (pr.critical) cfg = criticallyDamped(cfg);
  if (pr.overshoot === 'none' || th.overshoot === 0) cfg = { ...cfg, damping: 2 * Math.sqrt(cfg.stiffness * cfg.mass) };
  if (pr.overshoot === 'full' && th.overshoot > 0) cfg = capOvershoot(cfg);

  return cfg;
}

/** The theme's signature spring (used when a surface says "use the theme"). */
export function themeSpring() { return springConfig('theme'); }

/** Scale a time token by profile + theme (ms). */
export function duration(base = 320) {
  const ms = base * profile().timeScale * theme().timeScale;
  return Math.max(60, Math.round(ms));
}
export function token(name = 'NORMAL') { return duration(TOKENS[name] ?? TOKENS.NORMAL); }

/** Stagger between siblings (ms). */
export function stagger(base) {
  return Math.round((base ?? 40) * profile().stagger / 40 * (theme().stagger / 40));
}

export function blurPx() { return Math.round(profile().blur * theme().blur); }
export function parallax() { return profile().parallax; }
export function usesArcs() { return profile().arcs && theme().arc > 0; }
export function arcBias() { return theme().arc; }
export function scaleCap() { return profile().scaleMax; }

/** Current overshoot estimate, for the telemetry panel. */
export function currentOvershoot() {
  const z = dampingRatio(springConfig('theme'));
  return z >= 1 ? 0 : overshootOf(springConfig('theme'));
}

/* ── apply to the document ───────────────────────────────────────── */
export function applyConfig() {
  const body = document.body;
  body.dataset.mode = nova.mode;
  body.dataset.accent = nova.accent;
  body.dataset.theme = nova.theme;
  body.dataset.profile = nova.profile;
  body.dataset.motion = nova.profile === 'reduced' || nova.reduceSystem ? 'reduced' : 'normal';

  const a = ACCENTS[nova.accent] || ACCENTS.violet;
  const root = document.documentElement.style;
  root.setProperty('--nv-accent', a.accent);
  root.setProperty('--nv-accent-2', a.accent2);

  // time tokens exposed for CSS-only transitions (fades, tints)
  root.setProperty('--nv-fast', `${duration(TOKENS.FAST)}ms`);
  root.setProperty('--nv-normal', `${duration(TOKENS.NORMAL)}ms`);
  root.setProperty('--nv-slow', `${duration(TOKENS.SLOW)}ms`);
  root.setProperty('--nv-long', `${duration(TOKENS.LONG)}ms`);

  for (const fn of listeners) fn(nova);
}
