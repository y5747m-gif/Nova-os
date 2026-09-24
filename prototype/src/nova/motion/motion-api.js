/* ══════════════════════════════════════════════════════════════
   NOVA MOTION API — Official API per spec #61
   NovaMotion.open(), close(), morph(), expand(), collapse(),
   spring(), orbit(), reveal(), transition()
   Plus Text Motion System per spec #19-20
   ══════════════════════════════════════════════════════════════ */

import NovaMotion, { clamp, lerp } from '../../motion/motion.js';
import { springConfig, duration as tokenDuration } from '../../motion/config.js';
import { performanceManager } from '../performance/performance.js';

/* ── Core Motion API ───────────────────────────────────────── */
export const MotionAPI = {
  /**
   * Open animation: Card → Lift → Expand → Morph → Application
   * per spec #24
   */
  open({ el, from, to, onProgress, onDone, springName = 'SOFT' }) {
    if (performanceManager.shouldReduceMotion()) {
      // Reduced motion: simple fade
      el.style.opacity = '0';
      el.style.transform = `translate3d(0, 20px, 0)`;
      const handle = NovaMotion.spring({
        from: 0, to: 1, springName: 'SNAP',
        onUpdate: (v) => {
          el.style.opacity = String(v);
          el.style.transform = `translate3d(0, ${(1 - v) * 20}px, 0)`;
          onProgress?.(v);
        },
        onDone: () => onDone?.('commit', 1),
      });
      return handle;
    }

    const morph = NovaMotion.morph({
      el, from, to,
      radiusFrom: 22, radiusTo: 28,
      springName,
      travel: Math.hypot(to.w - from.w, to.h - from.h),
      arc: 0.65,
      blur: 7,
      onProgress,
      onDone,
    });
    morph.release('commit', 900);
    return morph;
  },

  /**
   * Close animation: Application → Compress → Morph → Card
   * per spec #25
   */
  close({ el, from, to, onProgress, onDone, springName = 'SOFT' }) {
    if (performanceManager.shouldReduceMotion()) {
      const handle = NovaMotion.spring({
        from: 1, to: 0, springName: 'SNAP',
        onUpdate: (v) => {
          el.style.opacity = String(v);
          el.style.transform = `translate3d(0, ${(1 - v) * 20}px, 0)`;
          onProgress?.(v);
        },
        onDone: () => onDone?.('cancel', 0),
      });
      return handle;
    }

    const morph = NovaMotion.morph({
      el, from: to, to: from,
      radiusFrom: 20, radiusTo: 28,
      springName,
      travel: 600,
      onProgress,
      onDone,
    });
    morph.set(1);
    morph.release('cancel', 700);
    return morph;
  },

  /**
   * Morph — continuity primitive, shared element transition
   */
  morph(opts) {
    return NovaMotion.morph(opts);
  },

  /**
   * Expand animation
   */
  expand({ el, from = 0, to = 1, springName = 'SOFT', onProgress, onDone }) {
    const handle = NovaMotion.spring({
      from, to,
      springName,
      onUpdate: (v) => {
        const scale = 0.92 + 0.08 * v;
        el.style.transform = `scale(${scale})`;
        el.style.opacity = String(v);
        onProgress?.(v);
      },
      onDone: (v) => onDone?.(v > 0.5 ? 'commit' : 'cancel', v),
    });
    return handle;
  },

  /**
   * Collapse animation
   */
  collapse({ el, from = 1, to = 0, springName = 'SOFT', onProgress, onDone }) {
    const handle = NovaMotion.spring({
      from, to,
      springName,
      onUpdate: (v) => {
        const scale = 0.92 + 0.08 * v;
        el.style.transform = `scale(${scale})`;
        el.style.opacity = String(v);
        onProgress?.(v);
      },
      onDone: (v) => onDone?.(v > 0.5 ? 'commit' : 'cancel', v),
    });
    return handle;
  },

  /**
   * Spring — raw spring physics
   */
  spring(opts) {
    return NovaMotion.spring(opts);
  },

  /**
   * Orbit — elements travel on arc around centre
   */
  orbit(opts) {
    return NovaMotion.orbital(opts);
  },

  /**
   * Reveal — element appears with depth
   */
  reveal({ el, direction = 'up', distance = 30, springName = 'SOFT', onProgress, onDone }) {
    const axis = direction === 'up' || direction === 'down' ? 'Y' : 'X';
    const sign = direction === 'up' || direction === 'left' ? 1 : -1;
    
    const handle = NovaMotion.spring({
      from: 0, to: 1,
      springName,
      onUpdate: (v) => {
        el.style.transform = `translate${axis}(${(1 - v) * distance * sign}px) scale(${0.96 + 0.04 * v})`;
        el.style.opacity = String(v);
        onProgress?.(v);
      },
      onDone: (v) => onDone?.('commit', v),
    });
    return handle;
  },

  /**
   * Transition — generic transition with physics
   */
  transition({ el, from, to, property = 'transform', springName = 'SOFT', onProgress, onDone }) {
    const handle = NovaMotion.spring({
      from: from ?? 0, to: to ?? 1,
      springName,
      onUpdate: (v) => {
        if (property === 'transform') {
          el.style.transform = `translate3d(0, ${(1 - v) * 20}px, 0)`;
        }
        el.style.opacity = String(v);
        onProgress?.(v);
      },
      onDone: (v) => onDone?.(v > 0.5 ? 'commit' : 'cancel', v),
    });
    return handle;
  },

  /**
   * Depth — Z changes recede background
   */
  depth(opts) {
    return NovaMotion.depth(opts);
  },

  /**
   * Panel — bottom/top sheets
   */
  panel(opts) {
    return NovaMotion.panel(opts);
  },

  /**
   * Cascade — staggered siblings
   */
  cascade(opts) {
    return NovaMotion.cascade(opts);
  },
};

/* ── Text Motion System per spec #19-20 ────────────────────── */
export const TextMotion = {
  /**
   * Word Rise — words appear from bottom
   */
  wordRise(el, options = {}) {
    if (!el) return;
    const words = el.textContent.split(' ');
    el.innerHTML = words.map(w => `<span class="nova-text-word">${w}</span>`).join(' ');
    const wordEls = el.querySelectorAll('.nova-text-word');
    
    const cascade = NovaMotion.cascade({
      items: Array.from(wordEls),
      stagger: options.stagger ?? 40,
      span: options.span ?? 400,
      springName: 'SOFT',
      onUpdate: (wordEl, _i, p) => {
        wordEl.style.transform = `translateY(${(1 - p) * 12}px)`;
        wordEl.style.opacity = String(p);
        wordEl.style.display = 'inline-block';
      },
    });
    cascade.release('commit', 600);
    return cascade;
  },

  /**
   * Letter Flow — for important titles only
   */
  letterFlow(el, options = {}) {
    if (!el) return;
    if (performanceManager.shouldReduceMotion()) {
      // Fallback to fade
      el.style.opacity = '0';
      NovaMotion.spring({
        from: 0, to: 1, springName: 'SOFT',
        onUpdate: (v) => { el.style.opacity = String(v); }
      });
      return;
    }
    
    const text = el.textContent;
    el.innerHTML = [...text].map(c => 
      c === ' ' ? ' ' : `<span class="nova-text-letter">${c}</span>`
    ).join('');
    const letterEls = el.querySelectorAll('.nova-text-letter');
    
    const cascade = NovaMotion.cascade({
      items: Array.from(letterEls),
      stagger: options.stagger ?? 25,
      span: options.span ?? 600,
      springName: 'ELASTIC',
      onUpdate: (letterEl, _i, p) => {
        letterEl.style.transform = `translateY(${(1 - p) * 20}px) rotateX(${(1 - p) * 20}deg)`;
        letterEl.style.opacity = String(p);
        letterEl.style.display = 'inline-block';
      },
    });
    cascade.release('commit', 800);
    return cascade;
  },

  /**
   * Blur-to-Clear — text starts soft then clear
   */
  blurToClear(el, options = {}) {
    if (!el) return;
    const blurMax = options.blur ?? 8;
    el.style.filter = `blur(${blurMax}px)`;
    el.style.opacity = '0.3';
    
    const handle = NovaMotion.spring({
      from: 0, to: 1,
      springName: options.springName || 'SOFT',
      onUpdate: (v) => {
        el.style.filter = `blur(${(1 - v) * blurMax}px)`;
        el.style.opacity = String(0.3 + 0.7 * v);
      },
    });
    return handle;
  },

  /**
   * Morph Text — old text morphs to new
   */
  morphText(el, newText, options = {}) {
    if (!el) return;
    const oldText = el.textContent;
    if (oldText === newText) return;
    
    // Simple crossfade morph — advanced would use FLIP
    const handle = NovaMotion.spring({
      from: 0, to: 1,
      springName: 'SOFT',
      onUpdate: (v) => {
        if (v < 0.5) {
          el.style.opacity = String(1 - v * 2);
          el.style.transform = `translateY(${-v * 10}px)`;
        } else {
          if (el.textContent !== newText) el.textContent = newText;
          el.style.opacity = String((v - 0.5) * 2);
          el.style.transform = `translateY(${(1 - v) * 10}px)`;
        }
      },
    });
    return handle;
  },

  /**
   * Number Morph — numbers change smoothly
   */
  numberMorph(el, newValue, options = {}) {
    if (!el) return;
    const oldValue = parseFloat(el.textContent) || 0;
    const diff = newValue - oldValue;
    if (diff === 0) return;
    
    const handle = NovaMotion.spring({
      from: oldValue, to: newValue,
      springName: 'SOFT',
      onUpdate: (v) => {
        el.textContent = options.format ? 
          options.format(Math.round(v)) : 
          Math.round(v).toString();
      },
    });
    return handle;
  },

  /**
   * Simple fade/translate for normal text — per spec #20
   */
  fadeIn(el, options = {}) {
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = `translateY(${options.distance || 8}px)`;
    
    const handle = NovaMotion.spring({
      from: 0, to: 1,
      springName: 'SOFT',
      onUpdate: (v) => {
        el.style.opacity = String(v);
        el.style.transform = `translateY(${(1 - v) * (options.distance || 8)}px)`;
      },
    });
    return handle;
  },
};

/* ── Unified NovaMotion API with all methods ───────────────── */
export const NovaMotionAPI = {
  ...MotionAPI,
  text: TextMotion,
  
  // Legacy compatibility
  ...NovaMotion,
  
  // New official API per spec #61
  open: MotionAPI.open,
  close: MotionAPI.close,
  morph: MotionAPI.morph,
  expand: MotionAPI.expand,
  collapse: MotionAPI.collapse,
  spring: MotionAPI.spring,
  orbit: MotionAPI.orbit,
  reveal: MotionAPI.reveal,
  transition: MotionAPI.transition,
};

export default NovaMotionAPI;
