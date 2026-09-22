/* ══════════════════════════════════════════════════════════════
   NOVA GESTURE — zone arbitration + progress stream
   Zones (docs/01 §5):  right edge = Back · bottom = CORE
                        top   = FLOW · top-right corner = CONTROL
                        surface = content (collapse / canvas / drag)
   The engine only reports; product decisions live in the surfaces.
   ══════════════════════════════════════════════════════════════ */

export const EDGE = 26;      // edge band (px)
export const CORNER = 60;    // corner hit box (px)
export const ENGAGE = 7;     // px before a gesture is "engaged"
export const VEL_WINDOW = 90; // ms for velocity estimation

export function zoneFor(x, y, w, h) {
  if (x > w - CORNER && y < CORNER) return 'corner';
  if (y > h - EDGE) return 'bottom';
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
} = {}) {
  let active = null;

  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target;
    if (target?.closest?.('[data-drag]')) return;      // component drag wins
    if (target?.closest?.('input, textarea, [data-nodrag]')) return;

    const r = screen.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const zone = zoneFor(x, y, r.width, r.height);
    if (!isZoneEnabled(zone)) return;

    active = {
      zone, id: e.pointerId,
      x0: x, y0: y, t0: performance.now(),
      x, y, dx: 0, dy: 0,
      engaged: false,
      samples: [],
      velocity: 0,
      target,
    };
    // NOTE: no pointer capture here. Capturing on every pointerdown makes the
    // browser retarget the eventual `click` to #screen (the capturing element),
    // so no button inside the phone would ever receive its click. We capture
    // only once a real swipe is engaged (see move()).
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
      // a real swipe: now own the pointer so it survives leaving the screen
      try { screen.setPointerCapture?.(active.id); } catch { /* ignore */ }
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
      try { if (screen.hasPointerCapture?.(a.id)) screen.releasePointerCapture?.(a.id); } catch { /* ignore */ }
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
    // capture only once the drag engages — otherwise taps on buttons inside
    // a draggable (window chrome, orb actions, dnd tiles) lose their click
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
      try { el.setPointerCapture?.(st.id); } catch { /* ignore */ }
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
    try { if (el.hasPointerCapture?.(s.id)) el.releasePointerCapture?.(s.id); } catch { /* ignore */ }
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    if (s.engaged) onEnd?.(e, { dx: e.clientX - s.x0, dy: e.clientY - s.y0, cancelled: e.type === 'pointercancel' });
  }

  el.addEventListener('pointerdown', down);
  el.style.touchAction = 'none';
  return () => el.removeEventListener('pointerdown', down);
}
