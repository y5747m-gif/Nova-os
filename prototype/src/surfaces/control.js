/* ══════════════════════════════════════════════════════════════
   NOVA CONTROL — a radial control surface (docs/01 §12)
   Elements sit on a ring and physically follow your finger.
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import NovaMotion from '../motion/motion.js';
import { draggable } from '../motion/gestures.js';

const NODES = [
  { id: 'wifi',     label: 'Wi-Fi',    icon: 'wifi',      value: 1,  binary: true,  color: '#7dd3fc' },
  { id: 'bt',       label: 'بلوتوث',   icon: 'bluetooth', value: 0,  binary: true,  color: '#6c5ce7' },
  { id: 'sound',    label: 'الصوت',    icon: 'sound',     value: .7, binary: false, color: '#34d399' },
  { id: 'torch',    label: 'الكشاف',   icon: 'torch',     value: 0,  binary: true,  color: '#f5a524' },
  { id: 'airplane', label: 'طيران',    icon: 'airplane',  value: 0,  binary: true,  color: '#ff6b9a' },
  { id: 'battery',  label: 'موفّر',    icon: 'battery',   value: .6, binary: false, color: '#22d3ee' },
];

const SECTOR = 0.36; // radians of travel per node

export function mountControl(layer, ctx = {}) {
  const ring = h('div', { class: 'control__ring' }, h('div', { class: 'circle' }));
  const center = h('button', {
    class: 'control__center',
    dataset: { nodrag: '1' },
    onclick: () => ctx.onCore?.(),
  }, h('span', {}, 'NOVA CORE'), h('small', {}, 'اضغط للمركز'));

  const el = h('div', { class: 'control' }, ring);
  ring.append(center);
  el.style.opacity = '0';
  layer.append(el);

  const nodes = [];

  function polar(angle, r) { return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }; }

  NODES.forEach((def, i) => {
    const base = -Math.PI / 2 + (i * 2 * Math.PI) / NODES.length;
    const node = h('button', {
      class: 'control__node',
      dataset: { nodrag: '1', node: def.id, on: def.value > 0.5 ? '1' : '0' },
      title: def.label,
    },
      h('span', { style: { color: def.color }, html: icon(def.icon, 'ico ico--sm') }),
      h('small', {}, def.label),
    );
    ring.append(node);
    const entry = { def, node, angle: base, base };
    nodes.push(entry);
    entry.layout = (turn = 0) => {
      const pt = polar(entry.angle, 116);
      node.style.transform = `translate3d(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0) scale(${(0.9 + 0.1 * entry.def.value).toFixed(3)})`;
      node.dataset.on = entry.def.value > 0.5 ? '1' : '0';
    };
    entry.layout();

    draggable(node, {
      engage: 3,
      onStart: () => { node.dataset.active = '1'; entry.startAngle = entry.angle; },
      onMove: (e) => {
        const r = ring.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
        const rel = normalize(ang - entry.base);
        const clamped = Math.max(-SECTOR, Math.min(SECTOR, rel));
        const prevStep = Math.round(entry.def.value * 10);
        entry.angle = entry.base + clamped;
        entry.def.value = Math.max(0, Math.min(1, (clamped + SECTOR) / (2 * SECTOR)));
        entry.layout();
        node.style.boxShadow = `0 0 0 ${(4 + 8 * entry.def.value).toFixed(1)}px color-mix(in srgb, ${entry.def.color} 26%, transparent)`;
        ctx.onValueChange?.(entry.def);
        if (Math.round(entry.def.value * 10) !== prevStep) ctx.emit?.('tick');
      },
      onEnd: () => {
        delete node.dataset.active;
        if (entry.def.binary) {
          // release decides by position, exactly like a gesture commit
          entry.def.value = entry.def.value > 0.5 ? 1 : 0;
          entry.asset = entry.def.value;
          ctx.emit?.(entry.def.value ? 'success' : 'close');
          ctx.onToggle?.(entry.def, entry.def.value === 1);
        } else {
          ctx.emit?.('tick');
        }
        entry.layout();
        NovaMotion.spring({
          from: 1.14, to: 1, springName: 'SNAP',
          onUpdate: (v) => { node.style.scale = String(v); },
        });
      },
    });

    node.addEventListener('click', () => {
      if (def.binary) {
        def.value = def.value > 0.5 ? 0 : 1;
        entry.layout();
        ctx.emit?.(def.value ? 'success' : 'close');
        ctx.onToggle?.(def, def.value === 1);
      } else {
        def.value = def.value > 0.5 ? 0.2 : 0.8;
        entry.layout();
        ctx.onValueChange?.(def);
      }
    });
    node.dataset.nodrag = '1';
  });

  // the whole ring leans toward the pointer — "elements follow your finger"
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
    const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    ring.style.transform = `translate3d(${(dx * 16).toFixed(1)}px, ${(dy * 16).toFixed(1)}px, 0)`;
  });

  function normalize(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function enter() {
    NovaMotion.spring({ from: 0, to: 1, springName: 'SOFT', onUpdate: (v) => { el.style.opacity = String(v); } });
    nodes.forEach((n, i) => {
      setTimeout(() => {
        NovaMotion.spring({
          from: 0.6, to: 1, springName: 'ORBIT',
          onUpdate: (v) => {
            const p = polar(n.angle, 116 * Math.min(1.06, v));
            n.node.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${v.toFixed(3)})`;
          },
        });
      }, i * NovaMotion.stagger(36));
    });
  }

  function state() {
    return NODES.map((n) => ({ id: n.id, label: n.label, value: n.value }));
  }

  // a modal overlay: screen-level zone gestures must not fight it
  el.dataset.nodrag = '1';
  el.addEventListener('click', (e) => { if (e.target === el) ctx.onClose?.(); });

  return { el, enter, state, nodes };
}
