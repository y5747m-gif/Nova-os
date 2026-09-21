/* ══════════════════════════════════════════════════════════════
   NOVA HAPTICS (docs/05 §10)
   A consistent feel per event + an energy budget per minute.
   Uses navigator.vibrate where available (Android/Chrome).
   ══════════════════════════════════════════════════════════════ */

const PATTERNS = {
  open: [8],
  close: [14],
  tick: [3],
  snap: [10],
  success: [12, 60, 12],
  error: [16],
  orb: [10, 40, 10],
  defer: [6, 30, 6],
  sweep: [5],
};

let enabled = typeof navigator !== 'undefined' && !!navigator.vibrate;
let energy = 0;
let windowStart = performance.now();
const BUDGET_PER_MIN = 900; // ms of vibration

export function setHapticsEnabled(v) { enabled = v && !!navigator.vibrate; }
export function hapticsAvailable() { return !!navigator.vibrate; }

export function haptic(kind = 'tick', scale = 1) {
  const pattern = PATTERNS[kind];
  if (!pattern || !enabled) return;

  const now = performance.now();
  if (now - windowStart > 60000) { energy = 0; windowStart = now; }
  const cost = pattern.reduce((a, b) => a + b, 0);
  if (energy + cost > BUDGET_PER_MIN) return; // budget exhausted — stay silent
  energy += cost;

  try { navigator.vibrate(pattern.map((p) => Math.max(1, Math.round(p * scale)))); } catch { /* ignore */ }
}

export function hapticBudgetLeft() { return Math.max(0, BUDGET_PER_MIN - energy); }
