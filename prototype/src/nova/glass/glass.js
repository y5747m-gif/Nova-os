/* ══════════════════════════════════════════════════════════════
   NOVA GLASS ENGINE — per spec #6-9, #59
   Four levels: Clear, Soft, Solid, Ultra + Adaptive Glass
   Performance-aware, cached, GPU-accelerated, clipped surfaces
   ══════════════════════════════════════════════════════════════ */

import { NovaTokens } from '../tokens/tokens.js';
import { performanceManager } from '../performance/performance.js';

/* ── Glass levels ──────────────────────────────────────────── */
export const GlassLevels = {
  clear: {
    id: 'clear',
    name: 'Glass Clear',
    blur: 8,
    opacity: 0.32,
    edgeHighlight: 0.08,
    innerGlow: 0.04,
    shadow: 0.15,
    saturation: 1.1,
    performance: 'high',
  },
  soft: {
    id: 'soft',
    name: 'Glass Soft',
    blur: 14,
    opacity: 0.56,
    edgeHighlight: 0.12,
    innerGlow: 0.08,
    shadow: 0.22,
    saturation: 1.15,
    performance: 'medium',
  },
  solid: {
    id: 'solid',
    name: 'Glass Solid',
    blur: 4,
    opacity: 0.82,
    edgeHighlight: 0.16,
    innerGlow: 0.02,
    shadow: 0.30,
    saturation: 1.0,
    performance: 'low',
  },
  ultra: {
    id: 'ultra',
    name: 'Glass Ultra',
    blur: 22,
    opacity: 0.64,
    edgeHighlight: 0.18,
    innerGlow: 0.14,
    shadow: 0.28,
    saturation: 1.25,
    performance: 'ultra',
  },
};

/* ── Adaptive selection based on device capability ─────────── */
export function selectAdaptiveGlassLevel() {
  const perf = performanceManager.getState();
  if (perf.mode === 'battery' || perf.mode === 'reduced') return 'solid';
  if (perf.thermal === 'critical' || perf.thermal === 'severe') return 'solid';
  if (perf.memoryPressure > 0.85) return 'solid';
  if (perf.fps < 45) return 'solid';
  if (perf.deviceTier === 'low') return 'solid';
  if (perf.deviceTier === 'mid') return 'soft';
  if (perf.gpuLoad > 0.8) return 'soft';
  return perf.deviceTier === 'high' ? 'ultra' : 'soft';
}

/* ── Glass rendering with caching ──────────────────────────── */
const backgroundCache = new Map();
let cacheEnabled = true;

export function enableGlassCache(enabled) {
  cacheEnabled = enabled;
  if (!enabled) backgroundCache.clear();
}

/**
 * NovaGlassSurface — unified component API per spec #59
 * Provides: NovaGlassSurface, Card, Panel, Button, Dialog, Navigation, Notification, Orb
 */
export class NovaGlassSurface {
  constructor(level = 'soft', options = {}) {
    this.level = level;
    this.options = {
      depth: options.depth ?? 1,
      interactive: options.interactive ?? true,
      cached: options.cached ?? true,
      clipped: options.clipped ?? true,
      ...options,
    };
    this.config = GlassLevels[level] || GlassLevels.soft;
  }

  /** Apply glass styling to an element */
  applyTo(el) {
    if (!el) return;
    const cfg = this.getEffectiveConfig();
    const isDark = document.body.dataset.mode !== 'light';
    const baseOpacity = cfg.opacity;
    
    // Core glass properties
    el.style.setProperty('--nv-glass-level', cfg.id);
    el.style.setProperty('--nv-glass-blur', `${cfg.blur}px`);
    el.style.setProperty('--nv-glass-opacity', baseOpacity);
    
    // Background with transparency
    if (isDark) {
      el.style.background = `color-mix(in srgb, var(--nv-surface) ${Math.round(baseOpacity * 100)}%, transparent)`;
    } else {
      el.style.background = `color-mix(in srgb, var(--nv-surface) ${Math.round(baseOpacity * 100)}%, transparent)`;
    }
    
    // Blur — only if performance allows and not too many layers
    const liveBlurLayers = document.querySelectorAll('[data-glass-live="1"]').length;
    const canBlur = cfg.blur > 0 && liveBlurLayers < 2 && performanceManager.shouldUseBlur();
    
    if (canBlur) {
      el.style.backdropFilter = `blur(${cfg.blur}px) saturate(${cfg.saturation})`;
      el.style.webkitBackdropFilter = `blur(${cfg.blur}px) saturate(${cfg.saturation})`;
      el.dataset.glassLive = '1';
    } else {
      el.style.backdropFilter = '';
      el.style.webkitBackdropFilter = '';
      el.dataset.glassLive = '0';
    }
    
    // Edge highlight
    el.style.border = `1px solid color-mix(in srgb, var(--nv-text) ${Math.round(cfg.edgeHighlight * 100)}%, transparent)`;
    
    // Inner glow
    if (cfg.innerGlow > 0.02) {
      el.style.boxShadow = `
        inset 0 1px 0 color-mix(in srgb, var(--nv-text) ${Math.round(cfg.innerGlow * 100)}%, transparent),
        0 ${4 * this.options.depth}px ${18 * this.options.depth}px rgba(0,0,0,${cfg.shadow})
      `;
    } else {
      el.style.boxShadow = `0 ${4 * this.options.depth}px ${18 * this.options.depth}px rgba(0,0,0,${cfg.shadow})`;
    }
    
    // GPU-friendly compositing without pinning every glass surface in a
    // permanent will-change layer (which can increase GPU memory usage).
    el.classList.add('nova-glass-layer');
    el.style.transform = 'translateZ(0)';
    
    // Clipped surface optimization
    if (this.options.clipped) {
      el.style.contain = 'layout style paint';
      el.style.overflow = 'hidden';
    }
    
    el.style.setProperty('--nv-glass-blur-effective', `${canBlur ? cfg.blur : 0}px`);
    el.dataset.glass = cfg.id;
    el.dataset.glassDepth = String(this.options.depth);
  }

  getEffectiveConfig() {
    const adaptive = selectAdaptiveGlassLevel();
    // If system forces lower level, use it
    if (performanceManager.shouldDowngradeGlass()) {
      return GlassLevels[adaptive] || this.config;
    }
    return this.config;
  }

  /** Static snapshot optimization — cache background when static */
  snapshot(el) {
    if (!cacheEnabled || !this.options.cached) return;
    if (!el) return;
    try {
      const key = `${this.level}-${el.offsetWidth}-${el.offsetHeight}`;
      if (backgroundCache.has(key)) {
        el.style.backgroundImage = backgroundCache.get(key);
      }
    } catch {}
  }

  destroy(el) {
    if (!el) return;
    el.dataset.glassLive = '0';
  }
}

/* ── Convenience components ────────────────────────────────── */
export class NovaGlassCard extends NovaGlassSurface {
  constructor(level = 'soft', options = {}) {
    super(level, { depth: 1, radius: 22, ...options });
  }
  applyTo(el) {
    super.applyTo(el);
    el.style.borderRadius = `${this.options.radius || 22}px`;
    el.classList.add('nova-glass-card');
  }
}

export class NovaGlassPanel extends NovaGlassSurface {
  constructor(level = 'soft', options = {}) {
    super(level, { depth: 2, radius: 32, ...options });
  }
  applyTo(el) {
    super.applyTo(el);
    el.style.borderRadius = `${this.options.radius || 32}px`;
    el.style.borderBottom = '0';
    el.classList.add('nova-glass-panel');
  }
}

export class NovaGlassButton extends NovaGlassSurface {
  constructor(level = 'soft', options = {}) {
    super(level, { depth: 0.5, radius: 999, interactive: true, ...options });
  }
  applyTo(el) {
    super.applyTo(el);
    el.style.borderRadius = `${this.options.radius || 999}px`;
    el.style.cursor = 'pointer';
    el.classList.add('nova-glass-button');
    if (this.options.interactive) {
      el.addEventListener('pointerenter', () => {
        el.style.transform = 'translateZ(0) scale(1.02)';
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = 'translateZ(0) scale(1)';
      });
    }
  }
}

export class NovaGlassDialog extends NovaGlassSurface {
  constructor(level = 'solid', options = {}) {
    super(level, { depth: 3, radius: 28, ...options });
  }
  applyTo(el) {
    super.applyTo(el);
    el.style.borderRadius = `${this.options.radius || 28}px`;
    el.style.boxShadow = `0 30px 90px rgba(0,0,0,.6), ${el.style.boxShadow}`;
    el.classList.add('nova-glass-dialog');
  }
}

export class NovaGlassNavigation extends NovaGlassSurface {
  constructor(level = 'soft', options = {}) {
    super(level, { depth: 1.5, radius: 22, ...options });
  }
  applyTo(el) {
    super.applyTo(el);
    el.style.borderRadius = `${this.options.radius || 22}px`;
    el.classList.add('nova-glass-navigation');
  }
}

export class NovaGlassNotification extends NovaGlassSurface {
  constructor(level = 'soft', options = {}) {
    super(level, { depth: 2, radius: 18, ...options });
  }
  applyTo(el) {
    super.applyTo(el);
    el.style.borderRadius = `${this.options.radius || 18}px`;
    el.classList.add('nova-glass-notification');
  }
}

export class NovaGlassOrb extends NovaGlassSurface {
  constructor(level = 'ultra', options = {}) {
    super(level, { depth: 1, radius: 999, ...options });
  }
  applyTo(el) {
    super.applyTo(el);
    el.style.borderRadius = '50%';
    el.style.aspectRatio = '1';
    el.classList.add('nova-glass-orb');
  }
}

/* ── Factory ───────────────────────────────────────────────── */
export function createGlass(type, level = 'soft', options = {}) {
  switch (type) {
    case 'card': return new NovaGlassCard(level, options);
    case 'panel': return new NovaGlassPanel(level, options);
    case 'button': return new NovaGlassButton(level, options);
    case 'dialog': return new NovaGlassDialog(level, options);
    case 'navigation': return new NovaGlassNavigation(level, options);
    case 'notification': return new NovaGlassNotification(level, options);
    case 'orb': return new NovaGlassOrb(level, options);
    default: return new NovaGlassSurface(level, options);
  }
}

/* ── Global glass manager ──────────────────────────────────── */
export const glassManager = {
  currentLevel: 'soft',
  adaptive: true,
  
  setLevel(level) {
    if (GlassLevels[level]) {
      this.currentLevel = level;
      document.body.dataset.glass = level;
      document.dispatchEvent(new CustomEvent('nova:glass-change', { detail: { level } }));
    }
  },
  
  setAdaptive(enabled) {
    this.adaptive = enabled;
    document.body.dataset.glassAdaptive = enabled ? '1' : '0';
  },
  
  getLevel() {
    return this.adaptive ? selectAdaptiveGlassLevel() : this.currentLevel;
  },
  
  applyToAll() {
    const level = this.getLevel();
    document.querySelectorAll('[data-glass]').forEach(el => {
      const type = el.dataset.glassType || 'surface';
      const glass = createGlass(type, level);
      glass.applyTo(el);
    });
  }
};

export default {
  GlassLevels,
  NovaGlassSurface,
  NovaGlassCard,
  NovaGlassPanel,
  NovaGlassButton,
  NovaGlassDialog,
  NovaGlassNavigation,
  NovaGlassNotification,
  NovaGlassOrb,
  createGlass,
  glassManager,
  selectAdaptiveGlassLevel,
};
