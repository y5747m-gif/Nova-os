/* ══════════════════════════════════════════════════════════════
   NOVA HAPTICS ENGINE — per spec #54, #58
   Haptic feedback system with budget, patterns
   ══════════════════════════════════════════════════════════════ */

import { performanceManager } from '../performance/performance.js';

export const HapticPatterns = {
  open: { duration: 8, type: 'light' },
  close: { duration: 14, type: 'soft' },
  tick: { duration: 3, type: 'micro' },
  snap: { duration: 10, type: 'medium' },
  success: { pattern: [12, 60, 12], type: 'success' },
  error: { duration: 16, type: 'error' },
  orb: { pattern: [10, 40, 10], type: 'rising' },
  selection: { duration: 5, type: 'light' },
  impact: { duration: 20, type: 'heavy' },
};

class NovaHapticsEngine {
  constructor() {
    this.enabled = true;
    this.budget = {
      maxPerMinute: 40,
      used: 0,
      windowStart: Date.now(),
      cooldown: 120,
      lastVibration: 0,
    };
    this.quietMode = false;
    this.reducedMotion = false;
    this.init();
  }

  init() {
    try {
      // Check reduced motion
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
        this.reducedMotion = e.matches;
      });

      // Check if vibration supported
      this.supported = 'vibrate' in navigator;
    } catch {
      this.supported = false;
    }
  }

  canVibrate() {
    if (!this.enabled || !this.supported) return false;
    if (this.quietMode) return false;
    if (this.reducedMotion && this.quietMode) return false;
    
    // Budget check
    const now = Date.now();
    if (now - this.budget.windowStart > 60000) {
      this.budget.used = 0;
      this.budget.windowStart = now;
    }
    
    if (this.budget.used >= this.budget.maxPerMinute) return false;
    if (now - this.budget.lastVibration < this.budget.cooldown) return false;
    
    // Don't vibrate during typing or call
    if (document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA') {
      return false;
    }
    
    return true;
  }

  vibrate(pattern) {
    if (!this.canVibrate()) return false;
    
    try {
      const result = navigator.vibrate(pattern);
      if (result) {
        this.budget.used++;
        this.budget.lastVibration = Date.now();
      }
      return result;
    } catch {
      return false;
    }
  }

  play(type) {
    if (!HapticPatterns[type]) return false;
    
    const pattern = HapticPatterns[type];
    const duration = pattern.duration || pattern.pattern;
    
    // Adjust for reduced motion
    if (this.reducedMotion) {
      if (type === 'tick' || type === 'selection') {
        // Skip micro-ticks in reduced motion
        return false;
      }
    }
    
    return this.vibrate(duration);
  }

  // Specific methods per spec
  open() { return this.play('open'); }
  close() { return this.play('close'); }
  tick() { return this.play('tick'); }
  snap() { return this.play('snap'); }
  success() { return this.play('success'); }
  error() { return this.play('error'); }
  orb() { return this.play('orb'); }

  // Drag micro-tick: 1 tick per 8dp
  dragTick(distance) {
    const ticks = Math.floor(distance / 8);
    if (ticks > 0) {
      return this.play('tick');
    }
    return false;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    try {
      localStorage.setItem('nova.haptics.enabled', String(enabled));
    } catch {}
  }

  setQuietMode(enabled) {
    this.quietMode = enabled;
  }

  getBudgetLeft() {
    const now = Date.now();
    if (now - this.budget.windowStart > 60000) {
      return this.budget.maxPerMinute;
    }
    return Math.max(0, this.budget.maxPerMinute - this.budget.used);
  }

  // Budget management
  resetBudget() {
    this.budget.used = 0;
    this.budget.windowStart = Date.now();
  }
}

export const hapticsEngine = new NovaHapticsEngine();
export default hapticsEngine;
