/* ══════════════════════════════════════════════════════════════
   NOVA GESTURE — zone arbitration + progress stream
   Zones (docs/01 §5):  right edge = Back · bottom = CORE
                        top   = FLOW · top-right corner = CONTROL
                        surface = content (collapse / canvas / drag)
   The engine only reports; product decisions live in the surfaces.
   ══════════════════════════════════════════════════════════════ */

export const EDGE = 26;      // right-edge band (px)
export const BOTTOM = 48;    // bottom band — the drawer starts from the very bottom
export const CORNER = 60;    // corner hit box (px)
export const ENGAGE = 7;     // px before a gesture is "engaged"
export const VEL_WINDOW = 90; // ms for velocity estimation

/* controls keep their own taps: Chromium retargets `click` to the pointer
   capture target, so a capture held by the screen would silence them */
const INTERACTIVE = 'button, a, input, textarea, select, label, [contenteditable]';

export function zoneFor(x, y, w, h, insetBottom = 0) {
  if (x > w - CORNER && y < CORNER) return 'corner';
  if (y > h - BOTTOM - insetBottom) return 'bottom';
  if (y < EDGE + 40) return 'top';
  if (x > w - EDGE) return 'right';
  return 'surface';
}

/**
 * Attach pointer arbitration to the whole screen.
 * Components that own a drag mark themselves with [data-drag] and win.
 */
export function attachGestures(screen, {
  onStart, onMove, onEnd, onZone,
  isZoneEnabled = () => true,
  getInsetBottom = () => 0,   // system nav bar owns its band — zones start above it
} = {}) {
  let active = null;
  let swallow = null;

  /* An ENGAGED drag must not also fire the tap that started it. The swallow
     is armed at pointerup — browsers dispatch the click that belongs to the
     gesture in the same input batch as pointerup — and it releases itself
     on the first click or microseconds later, so the NEXT tap always passes. */
  function releaseSwallow() {
    if (!swallow) return;
    screen.removeEventListener('click', swallow, { capture: true });
    swallow = null;
  }
  function armClickSwallow() {
    if (swallow) return;
    swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
      releaseSwallow();
    };
    screen.addEventListener('click', swallow, { capture: true });
    setTimeout(releaseSwallow, 60);
  }

  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target;
    if (target?.closest?.('[data-drag]')) return;      // component drag wins
    if (target?.closest?.('input, textarea, [data-nodrag]')) return;

    const r = screen.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const zone = zoneFor(x, y, r.width, r.height, getInsetBottom());
    if (!isZoneEnabled(zone)) return;

    /* a touch on a control is a candidate TAP first: capturing the pointer
       to the screen would retarget its `click` (Chromium) and the control
       would never fire — so a soft gesture never captures */
    const soft = !!target?.closest?.(INTERACTIVE);
    active = {
      zone, id: e.pointerId,
      x0: x, y0: y, t0: performance.now(),
      x, y, dx: 0, dy: 0,
      engaged: false,
      samples: [],
      velocity: 0,
      target,
      soft,
    };
    if (!soft) screen.setPointerCapture?.(e.pointerId);
    onZone?.(zone);
  }

  function move(e) {
    if (!active || e.pointerId !== active.id) return;
    const r = screen.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const dx = x - active.x0;
    const dy = y - active.y0;

    active.samples.push({ t: performance.now(), x, y });
    while (active.samples.length > 2 && performance.now() - active.samples[0].t > VEL_WINDOW) active.samples.shift();
    const first = active.samples[0];
    const dt = (performance.now() - first.t) / 1000;
    if (dt > 0.004) {
      active.velocity = Math.hypot(x - first.x, y - first.y) / dt;
      active.vx = (x - first.x) / dt;
      active.vy = (y - first.y) / dt;
    }
    active.x = x; active.y = y; active.dx = dx; active.dy = dy;

    const engaged = active.engaged ||
      (active.zone === 'bottom' && -dy > ENGAGE) ||
      (active.zone === 'top' && dy > ENGAGE) ||
      (active.zone === 'right' && -dx > ENGAGE) ||
      (active.zone === 'corner' && Math.hypot(dx, dy) > ENGAGE) ||
      (active.zone === 'surface' && Math.abs(dy) > ENGAGE);

    if (engaged && !active.engaged) {
      active.engaged = true;
      onStart?.(snapshot(active));
    }
    if (active.engaged) {
      e.preventDefault();
      onMove?.(snapshot(active));
    }
  }

  function up(e) {
    if (!active || (e.pointerId !== undefined && e.pointerId !== active.id)) return;
    const a = active;
    active = null;
    if (a.engaged) {
      armClickSwallow();
      onEnd?.(snapshot(a));
    }
  }

  function snapshot(a) {
    return {
      zone: a.zone,
      dx: a.dx, dy: a.dy,
      vx: a.vx || 0, vy: a.vy || 0,
      velocity: a.velocity,
      duration: performance.now() - a.t0,
      target: a.target,
    };
  }

  screen.addEventListener('pointerdown', down);
  screen.addEventListener('pointermove', move, { passive: false });
  screen.addEventListener('pointerup', up);
  screen.addEventListener('pointercancel', up);
  screen.addEventListener('lostpointercapture', up);

  return () => {
    screen.removeEventListener('pointerdown', down);
    screen.removeEventListener('pointermove', move);
    screen.removeEventListener('pointerup', up);
    screen.removeEventListener('pointercancel', up);
    screen.removeEventListener('lostpointercapture', up);
  };
}

/* ══════════════════════════════════════════════════════════════
   Component drag helper (windows, orb, photos, divider, dnd)
   ══════════════════════════════════════════════════════════════ */
export function draggable(el, {
  onStart, onMove, onEnd, engage = 4, axis = 'both', hold = 0,
} = {}) {
  let st = null;

  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    st = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY,
      engaged: false, t0: performance.now(), holdTimer: null, axis,
    };
    el.setPointerCapture?.(e.pointerId);
    if (hold > 0) st.holdTimer = setTimeout(() => { st.holdReady = true; }, hold);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0;
    const dy = e.clientY - st.y0;
    if (!st.engaged && Math.hypot(dx, dy) > engage && (!hold || st.holdReady)) {
      st.engaged = true;
      onStart?.(e, { x: e.clientX, y: e.clientY });
    }
    if (st.engaged) {
      e.preventDefault();
      onMove?.(e, { dx, dy, x: e.clientX, y: e.clientY, vx: e.clientX - st.lx, vy: e.clientY - st.ly });
    }
    st.lx = e.clientX; st.ly = e.clientY;
  }

  function up(e) {
    if (!st) return;
    const s = st; st = null;
    clearTimeout(s.holdTimer);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    if (s.engaged) onEnd?.(e, { dx: e.clientX - s.x0, dy: e.clientY - s.y0, cancelled: e.type === 'pointercancel' });
  }

  el.addEventListener('pointerdown', down);
  el.style.touchAction = 'none';
  return () => el.removeEventListener('pointerdown', down);
}
