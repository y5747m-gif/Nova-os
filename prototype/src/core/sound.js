/* ══════════════════════════════════════════════════════════════
   NOVA SOUND — synthesized (no assets) per docs/05 §9
   open · close · success · error · tick · orb · sweep
   ══════════════════════════════════════════════════════════════ */

let ctx = null;
let master = null;
let enabled = true;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  return ctx;
}

export function setSoundEnabled(v) { enabled = v; if (master) master.gain.value = v ? 0.22 : 0; }
export function isSoundEnabled() { return enabled; }

function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

/** A single synthesized tone. */
function tone({ f0, f1 = f0, dur = 0.1, type = 'sine', gain = 0.5, delay = 0, attack = 0.006, filter = 0 }) {
  if (!enabled || !ctx) return;
  resume();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (filter) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    osc.connect(lp);
    node = lp;
  }
  node.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.012, gain = 0.25, delay = 0, bp = 2400 }) {
  if (!enabled || !ctx) return;
  resume();
  const t0 = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = bp;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export const SOUND = {
  open()    { tone({ f0: 440, f1: 660, dur: 0.09, gain: 0.4, filter: 3200 }); },
  close()   { tone({ f0: 330, f1: 220, dur: 0.13, gain: 0.32, filter: 2200 }); },
  success() { tone({ f0: 660, dur: 0.07, gain: 0.34 }); tone({ f0: 880, dur: 0.08, gain: 0.3, delay: 0.06 }); },
  error()   { tone({ f0: 520, f1: 300, dur: 0.11, gain: 0.3, type: 'triangle', filter: 1600 }); },
  tick()    { noise({ dur: 0.012, gain: 0.16, bp: 2600 }); },
  defer()   { tone({ f0: 380, f1: 260, dur: 0.16, gain: 0.22, filter: 1400 }); },
  orb()     { tone({ f0: 720, f1: 980, dur: 0.12, gain: 0.16, filter: 3600 }); },
  sweep()   { noise({ dur: 0.16, gain: 0.12, bp: 900 }); },
  cold()    { tone({ f0: 220, f1: 540, dur: 0.5, gain: 0.2, filter: 1800 }); },
};

export function playSound(kind) { SOUND[kind]?.(); }
