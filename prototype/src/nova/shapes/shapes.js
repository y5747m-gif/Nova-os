/* ══════════════════════════════════════════════════════════════
   NOVA SHAPE ENGINE — per spec #10-11, #60
   Shapes: Orb, Capsule, Prism, Ring, Crystal, Node, Arc, Ribbon
   Interactive, not just decoration — status, action, navigation
   ══════════════════════════════════════════════════════════════ */

/* ── Base Shape class ──────────────────────────────────────── */
export class NovaShape {
  constructor(type, options = {}) {
    this.type = type;
    this.options = options;
    this.interactive = options.interactive ?? true;
    this.size = options.size ?? 48;
    this.color = options.color ?? 'var(--nv-accent)';
  }

  createElement() {
    const el = document.createElement('div');
    el.className = `nova-shape nova-shape--${this.type}`;
    el.dataset.shape = this.type;
    el.style.width = `${this.size}px`;
    el.style.height = `${this.size}px`;
    el.style.color = this.color;
    if (this.interactive) {
      el.style.cursor = 'pointer';
      el.tabIndex = 0;
    }
    return el;
  }

  applyTo(el) {
    if (!el) return;
    el.classList.add('nova-shape', `nova-shape--${this.type}`);
    el.dataset.shape = this.type;
  }
}

/* ── Orb — light sphere, central element ───────────────────── */
export class NovaOrb extends NovaShape {
  constructor(options = {}) {
    super('orb', { size: 64, ...options });
    this.state = options.state || 'idle';
    this.glow = options.glow ?? true;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-orb');
    el.dataset.orbState = this.state;
    el.innerHTML = `
      <div class="nova-orb__core"></div>
      <div class="nova-orb__glow"></div>
      <div class="nova-orb__ring"></div>
    `;
    this.applyState(el, this.state);
    return el;
  }

  applyState(el, state) {
    if (!el) return;
    el.dataset.orbState = state;
    this.state = state;
    // State-specific animations handled via CSS
    switch (state) {
      case 'idle':
        el.style.animation = 'nova-orb-breathe 3s ease-in-out infinite';
        break;
      case 'listening':
        el.style.transform = 'scale(1.08)';
        break;
      case 'thinking':
        el.style.animation = 'nova-orb-thinking 1.2s ease-in-out infinite';
        break;
      case 'processing':
        el.style.animation = 'nova-orb-processing 2s linear infinite';
        break;
      case 'success':
        el.style.animation = 'nova-orb-success 0.6s ease-out';
        break;
      case 'error':
        el.style.animation = 'nova-orb-error 0.4s ease-out';
        break;
    }
  }

  setState(state) {
    this.state = state;
    const el = document.querySelector(`[data-shape="orb"][data-orb-id="${this.id}"]`);
    if (el) this.applyState(el, state);
  }
}

/* ── Capsule — long oval ───────────────────────────────────── */
export class NovaCapsule extends NovaShape {
  constructor(options = {}) {
    super('capsule', { size: 48, ratio: 2.5, ...options });
    this.ratio = options.ratio ?? 2.5;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-capsule');
    el.style.width = `${this.size * this.ratio}px`;
    el.style.height = `${this.size}px`;
    el.style.borderRadius = '999px';
    el.innerHTML = `<div class="nova-capsule__inner"></div>`;
    return el;
  }
}

/* ── Prism — transparent geometric ─────────────────────────── */
export class NovaPrism extends NovaShape {
  constructor(options = {}) {
    super('prism', { size: 48, sides: 6, ...options });
    this.sides = options.sides ?? 6;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-prism');
    el.style.clipPath = this.getClipPath();
    el.innerHTML = `<div class="nova-prism__facet"></div>`;
    return el;
  }

  getClipPath() {
    // Hexagon by default
    if (this.sides === 6) {
      return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
    }
    return 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
  }
}

/* ── Ring — interactive ring ───────────────────────────────── */
export class NovaRing extends NovaShape {
  constructor(options = {}) {
    super('ring', { size: 48, thickness: 3, progress: 0, ...options });
    this.thickness = options.thickness ?? 3;
    this.progress = options.progress ?? 0;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-ring');
    const pct = Math.round(this.progress * 100);
    el.innerHTML = `
      <svg viewBox="0 0 44 44" class="nova-ring__svg">
        <circle cx="22" cy="22" r="18" class="nova-ring__track" />
        <circle cx="22" cy="22" r="18" class="nova-ring__progress" 
                style="--progress: ${pct}" />
      </svg>
      <div class="nova-ring__content">${this.options.content || ''}</div>
    `;
    el.dataset.progress = String(pct);
    return el;
  }

  setProgress(pct) {
    this.progress = pct / 100;
    const el = document.querySelector(`[data-shape="ring"][data-ring-id="${this.id}"]`);
    if (el) {
      const progressCircle = el.querySelector('.nova-ring__progress');
      if (progressCircle) {
        progressCircle.style.setProperty('--progress', pct);
      }
      el.dataset.progress = String(pct);
    }
  }
}

/* ── Crystal — glassy geometric ────────────────────────────── */
export class NovaCrystal extends NovaShape {
  constructor(options = {}) {
    super('crystal', { size: 48, facets: 8, ...options });
    this.facets = options.facets ?? 8;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-crystal');
    el.innerHTML = `
      <div class="nova-crystal__facet nova-crystal__facet--1"></div>
      <div class="nova-crystal__facet nova-crystal__facet--2"></div>
      <div class="nova-crystal__facet nova-crystal__facet--3"></div>
      <div class="nova-crystal__glow"></div>
    `;
    return el;
  }
}

/* ── Node — point connected by lines ───────────────────────── */
export class NovaNode extends NovaShape {
  constructor(options = {}) {
    super('node', { size: 12, connected: false, ...options });
    this.connected = options.connected ?? false;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-node');
    el.style.width = `${this.size}px`;
    el.style.height = `${this.size}px`;
    el.innerHTML = `<div class="nova-node__dot"></div>`;
    if (this.connected) {
      el.innerHTML += `<div class="nova-node__line"></div>`;
    }
    return el;
  }
}

/* ── Arc — interactive arc ─────────────────────────────────── */
export class NovaArc extends NovaShape {
  constructor(options = {}) {
    super('arc', { size: 96, thickness: 4, angle: 270, value: 0.5, ...options });
    this.thickness = options.thickness ?? 4;
    this.angle = options.angle ?? 270;
    this.value = options.value ?? 0.5;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-arc');
    el.style.width = `${this.size}px`;
    el.style.height = `${this.size}px`;
    const pct = this.value * this.angle;
    el.innerHTML = `
      <svg viewBox="0 0 100 100" class="nova-arc__svg">
        <path d="${this.getArcPath(0, this.angle)}" class="nova-arc__track" />
        <path d="${this.getArcPath(0, pct)}" class="nova-arc__progress" />
      </svg>
      <div class="nova-arc__handle" style="--angle: ${pct}deg"></div>
    `;
    return el;
  }

  getArcPath(start, end) {
    const r = 44;
    const cx = 50, cy = 50;
    const startRad = (start - 90) * Math.PI / 180;
    const endRad = (end - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const large = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  setValue(v) {
    this.value = Math.max(0, Math.min(1, v));
  }
}

/* ── Ribbon — flexible light ribbon ────────────────────────── */
export class NovaRibbon extends NovaShape {
  constructor(options = {}) {
    super('ribbon', { size: 48, width: 4, curve: 0.5, ...options });
    this.width = options.width ?? 4;
    this.curve = options.curve ?? 0.5;
  }

  createElement() {
    const el = super.createElement();
    el.classList.add('nova-ribbon');
    el.style.width = `${this.size * 3}px`;
    el.style.height = `${this.width}px`;
    el.innerHTML = `<div class="nova-ribbon__light"></div>`;
    return el;
  }
}

/* ── Factory ───────────────────────────────────────────────── */
export function createShape(type, options = {}) {
  switch (type) {
    case 'orb': return new NovaOrb(options);
    case 'capsule': return new NovaCapsule(options);
    case 'prism': return new NovaPrism(options);
    case 'ring': return new NovaRing(options);
    case 'crystal': return new NovaCrystal(options);
    case 'node': return new NovaNode(options);
    case 'arc': return new NovaArc(options);
    case 'ribbon': return new NovaRibbon(options);
    default: return new NovaShape(type, options);
  }
}

/* ── Shape usage mapping per spec #11 ──────────────────────── */
export const ShapeUsage = {
  wifi: 'orb',
  battery: 'ring',
  notifications: 'node',
  brightness: 'arc',
  activeApp: 'crystal',
  ai: 'orb',
  bluetooth: 'orb',
  volume: 'arc',
  airplane: 'node',
};

/* ── Shape system ──────────────────────────────────────────── */
export const shapeSystem = {
  create: createShape,
  
  applyMapping(element, feature) {
    const shapeType = ShapeUsage[feature] || 'orb';
    const shape = createShape(shapeType);
    shape.applyTo(element);
    return shape;
  },
  
  createInteractive(type, container, onInteract) {
    const shape = createShape(type, { interactive: true });
    const el = shape.createElement();
    if (onInteract) {
      el.addEventListener('click', onInteract);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onInteract(e);
        }
      });
    }
    container?.appendChild(el);
    return { shape, element: el };
  }
};

export default {
  NovaShape,
  NovaOrb,
  NovaCapsule,
  NovaPrism,
  NovaRing,
  NovaCrystal,
  NovaNode,
  NovaArc,
  NovaRibbon,
  createShape,
  ShapeUsage,
  shapeSystem,
};
