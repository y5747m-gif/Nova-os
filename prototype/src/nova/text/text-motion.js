/* ══════════════════════════════════════════════════════════════
   NOVA TEXT MOTION SYSTEM — per spec #18-20
   Typography with Arabic support, Word Rise, Letter Flow,
   Blur-to-Clear, Morph Text, Number Morph
   ══════════════════════════════════════════════════════════════ */

import NovaMotion from '../../motion/motion.js';
import { performanceManager } from '../performance/performance.js';

export const TextMotionTypes = {
  wordRise: 'wordRise',
  letterFlow: 'letterFlow',
  blurToClear: 'blurToClear',
  morphText: 'morphText',
  numberMorph: 'numberMorph',
  fadeTranslate: 'fadeTranslate',
};

export class NovaTextMotion {
  constructor() {
    this.activeAnimations = new Map();
  }

  /**
   * Word Rise — words appear from bottom with simple motion
   * Use for: body text, lists, cards
   */
  wordRise(element, options = {}) {
    if (!element || performanceManager.shouldReduceMotion()) {
      return this.fadeTranslate(element, options);
    }

    const text = element.textContent.trim();
    if (!text) return;

    const words = text.split(/\s+/);
    element.innerHTML = '';
    element.style.overflow = 'hidden';

    const wordSpans = words.map(word => {
      const span = document.createElement('span');
      span.textContent = word + ' ';
      span.style.display = 'inline-block';
      span.style.opacity = '0';
      span.style.transform = 'translateY(12px)';
      span.style.willChange = 'transform, opacity';
      element.appendChild(span);
      return span;
    });

    const cascade = NovaMotion.cascade({
      items: wordSpans,
      stagger: options.stagger ?? 35,
      span: options.span ?? 400,
      springName: 'SOFT',
      onUpdate: (el, _i, p) => {
        el.style.opacity = String(p);
        el.style.transform = `translateY(${(1 - p) * 12}px)`;
      },
    });

    cascade.release('commit', options.velocity ?? 600);
    return cascade;
  }

  /**
   * Letter Flow — for important headings only
   * Use sparingly, per spec #20
   */
  letterFlow(element, options = {}) {
    if (!element) return;
    
    if (performanceManager.shouldReduceMotion()) {
      return this.blurToClear(element, options);
    }

    const text = element.textContent;
    if (!text || text.length > 50) {
      // Too long for letter flow — fallback
      return this.wordRise(element, options);
    }

    element.innerHTML = '';
    const letters = [...text].map(char => {
      if (char === ' ') {
        const space = document.createTextNode(' ');
        element.appendChild(space);
        return null;
      }
      const span = document.createElement('span');
      span.textContent = char;
      span.style.display = 'inline-block';
      span.style.opacity = '0';
      span.style.transform = 'translateY(20px) rotateX(20deg)';
      span.style.willChange = 'transform, opacity';
      element.appendChild(span);
      return span;
    }).filter(Boolean);

    const cascade = NovaMotion.cascade({
      items: letters,
      stagger: options.stagger ?? 20,
      span: options.span ?? 500,
      springName: 'ELASTIC',
      onUpdate: (el, _i, p) => {
        el.style.opacity = String(p);
        el.style.transform = `translateY(${(1 - p) * 20}px) rotateX(${(1 - p) * 20}deg)`;
      },
    });

    cascade.release('commit', options.velocity ?? 800);
    return cascade;
  }

  /**
   * Blur-to-Clear — text starts soft then clear
   */
  blurToClear(element, options = {}) {
    if (!element) return;

    const blurMax = options.blur ?? 8;
    element.style.filter = `blur(${blurMax}px)`;
    element.style.opacity = '0.4';
    element.style.willChange = 'filter, opacity';

    const handle = NovaMotion.spring({
      from: 0, to: 1,
      springName: options.springName || 'SOFT',
      onUpdate: (v) => {
        element.style.filter = `blur(${(1 - v) * blurMax}px)`;
        element.style.opacity = String(0.4 + 0.6 * v);
      },
      onDone: () => {
        element.style.filter = '';
        element.style.willChange = '';
      }
    });

    return handle;
  }

  /**
   * Morph Text — old text transforms to new smoothly
   */
  morphText(element, newText, options = {}) {
    if (!element) return;
    
    const oldText = element.textContent;
    if (oldText === newText) return;

    // Store for interruption handling
    const id = element.dataset.textMorphId || `morph-${Date.now()}`;
    element.dataset.textMorphId = id;

    if (performanceManager.shouldReduceMotion()) {
      element.textContent = newText;
      return;
    }

    const handle = NovaMotion.spring({
      from: 0, to: 1,
      springName: options.springName || 'SOFT',
      onUpdate: (v) => {
        if (element.dataset.textMorphId !== id) return; // interrupted
        
        if (v < 0.5) {
          element.style.opacity = String(1 - v * 2);
          element.style.transform = `translateY(${-v * 8}px) scale(${1 - v * 0.05})`;
          element.style.filter = `blur(${v * 4}px)`;
        } else {
          if (element.textContent !== newText) {
            element.textContent = newText;
          }
          element.style.opacity = String((v - 0.5) * 2);
          element.style.transform = `translateY(${(1 - v) * 8}px) scale(${0.95 + (v - 0.5) * 0.1})`;
          element.style.filter = `blur(${(1 - v) * 4}px)`;
        }
      },
      onDone: () => {
        element.style.transform = '';
        element.style.filter = '';
        element.style.opacity = '';
      }
    });

    this.activeAnimations.set(id, handle);
    return handle;
  }

  /**
   * Number Morph — numbers change with smooth transition
   * e.g., 72% → 73% without disappearance
   */
  numberMorph(element, newValue, options = {}) {
    if (!element) return;

    const oldValue = parseFloat(element.textContent) || 0;
    if (oldValue === newValue) return;

    const id = element.dataset.numberMorphId || `num-${Date.now()}`;
    element.dataset.numberMorphId = id;

    const format = options.format || ((v) => Math.round(v).toString());
    const suffix = options.suffix || '';
    const prefix = options.prefix || '';

    const handle = NovaMotion.spring({
      from: oldValue, to: newValue,
      springName: options.springName || 'SOFT',
      onUpdate: (v) => {
        if (element.dataset.numberMorphId !== id) return;
        element.textContent = `${prefix}${format(v)}${suffix}`;
        // Subtle scale effect
        const progress = Math.abs(v - oldValue) / Math.max(1, Math.abs(newValue - oldValue));
        element.style.transform = `scale(${1 + Math.sin(progress * Math.PI) * 0.08})`;
      },
      onDone: () => {
        element.textContent = `${prefix}${format(newValue)}${suffix}`;
        element.style.transform = '';
      }
    });

    this.activeAnimations.set(id, handle);
    return handle;
  }

  /**
   * Fade/Translate simple — for normal text per spec #20
   */
  fadeTranslate(element, options = {}) {
    if (!element) return;

    const distance = options.distance ?? 8;
    const direction = options.direction ?? 'up';

    element.style.opacity = '0';
    element.style.willChange = 'transform, opacity';

    let transformFrom, transformTo;
    switch (direction) {
      case 'up':
        transformFrom = `translateY(${distance}px)`;
        transformTo = 'translateY(0)';
        break;
      case 'down':
        transformFrom = `translateY(${-distance}px)`;
        transformTo = 'translateY(0)';
        break;
      case 'left':
        transformFrom = `translateX(${distance}px)`;
        transformTo = 'translateX(0)';
        break;
      case 'right':
        transformFrom = `translateX(${-distance}px)`;
        transformTo = 'translateX(0)';
        break;
      default:
        transformFrom = `translateY(${distance}px)`;
        transformTo = 'translateY(0)';
    }

    element.style.transform = transformFrom;

    const handle = NovaMotion.spring({
      from: 0, to: 1,
      springName: options.springName || 'SOFT',
      onUpdate: (v) => {
        element.style.opacity = String(v);
        // Interpolate transform
        const y = (1 - v) * distance;
        if (direction === 'up' || direction === 'down') {
          const sign = direction === 'up' ? 1 : -1;
          element.style.transform = `translateY(${y * sign}px)`;
        } else {
          const sign = direction === 'left' ? 1 : -1;
          element.style.transform = `translateX(${y * sign}px)`;
        }
      },
      onDone: () => {
        element.style.transform = '';
        element.style.willChange = '';
      }
    });

    return handle;
  }

  /**
   * Stop all animations on element
   */
  stop(element) {
    if (!element) return;
    const morphId = element.dataset.textMorphId;
    const numId = element.dataset.numberMorphId;
    
    if (morphId && this.activeAnimations.has(morphId)) {
      this.activeAnimations.get(morphId)?.stop();
      this.activeAnimations.delete(morphId);
    }
    if (numId && this.activeAnimations.has(numId)) {
      this.activeAnimations.get(numId)?.stop();
      this.activeAnimations.delete(numId);
    }
  }
}

export const textMotion = new NovaTextMotion();
export default textMotion;
