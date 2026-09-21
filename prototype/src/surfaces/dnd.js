/* ══════════════════════════════════════════════════════════════
   System-level drag & drop (docs/01 §14)
   Drag the content itself — not a share sheet. Targets light up
   progressively by proximity, and the drop carries the content.
   ══════════════════════════════════════════════════════════════ */

import { h, gradient } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { CONTACTS } from '../core/store.js';
import { draggable } from '../motion/gestures.js';

export function createDnd({ layer, screen, ctx = {} }) {
  let ghost = null;
  let tray = null;
  let targets = [];
  let armed = null;
  let photoIndex = 0;

  function begin(photoEl, ev) {
    photoIndex = Number(photoEl.dataset.photo ?? 0);
    photoEl.dataset.dragging = '1';
    ghost = h('div', { class: 'drag-ghost', style: { background: gradient(photoIndex) } });
    ghost.style.left = `${ev.clientX - 48}px`;
    ghost.style.top = `${ev.clientY - 48}px`;
    document.body.append(ghost);
    buildTray();
    ctx.emit?.('tick');
    return photoEl;
  }

  function buildTray() {
    tray?.remove();
    targets = [];
    armed = null;
    const rowPerson = h('div', { class: 'drop-tray__row' });
    const rowOther = h('div', { class: 'drop-tray__row' });

    CONTACTS.forEach((c) => {
      const el = h('div', { class: 'drop-target', dataset: { target: c.id } },
        c.kind === 'person'
          ? h('span', { class: 'avatar' }, c.initials)
          : h('span', { class: 'avatar', style: { background: 'color-mix(in srgb, var(--nv-text) 10%, transparent)', color: 'var(--nv-text)' }, html: icon(c.icon || 'files', 'ico ico--sm') }),
        h('span', {}, c.name),
      );
      el.__contact = c;
      targets.push(el);
      (c.kind === 'person' ? rowPerson : rowOther).append(el);
    });

    tray = h('div', { class: 'drop-tray', dataset: { drag: 'tray' } },
      h('h4', {}, 'الصورة جاهزة للإرسال — اختار الهدف'),
      rowPerson,
      rowOther,
    );
    layer.append(tray);
  }

  function move(ev) {
    if (ghost) {
      ghost.style.left = `${ev.clientX - 48}px`;
      ghost.style.top = `${ev.clientY - 48}px`;
    }
    if (!tray) return;
    let best = null;
    let bestIntensity = 0;
    for (const t of targets) {
      const r = t.getBoundingClientRect();
      const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
      const intensity = Math.max(0, 1 - d / 190);
      t.style.transform = `scale(${(1 + intensity * 0.1).toFixed(3)})`;
      t.style.opacity = String(0.55 + intensity * 0.45);
      if (intensity > bestIntensity) { bestIntensity = intensity; best = t; }
    }
    const next = bestIntensity > 0.55 ? best : null;
    if (next !== armed) {
      armed?.removeAttribute('data-armed');
      armed = next;
      armed?.setAttribute('data-armed', '1');
      if (armed) ctx.emit?.('tick');   // proximity feedback, not a constant buzz
    }
  }

  function end() {
    ghost?.remove();
    ghost = null;
    const target = armed;
    const contact = target?.__contact;
    if (contact) {
      ctx.emit?.('success');
      if (contact.kind === 'person') ctx.onDropOnPerson?.(contact, photoIndex);
      else if (contact.kind === 'folder') ctx.toast?.(`تم النسخ إلى «${contact.name}» — والمصدر مربوط`);
      else ctx.toast?.(`جاهز للإرسال إلى ${contact.name} · محليًا`);
    } else {
      ctx.emit?.('error');
      ctx.toast?.('اتلغى الإرسال — رجعت الصورة مكانها');
    }
    tray?.remove();
    tray = null;
    targets = [];
    armed = null;
  }

  /** Attach photo dragging inside any gallery surface. */
  function enablePhotoDrag(root) {
    root.querySelectorAll('[data-photo]').forEach((ph) => {
      draggable(ph, {
        engage: 6,
        onStart: (ev) => begin(ph, ev),
        onMove: (ev) => move(ev),
        onEnd: () => { ph.dataset.dragging = ''; end(); },
      });
    });
  }

  return { enablePhotoDrag, begin, move, end, get dragging() { return !!ghost; } };
}
