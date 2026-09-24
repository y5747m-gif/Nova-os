/* ══════════════════════════════════════════════════════════════
   NOVA GESTURE ENGINE — per spec #23
   Supports: Swipe, Drag, Long Press, Pinch, Edge Swipe, Pull, Hold, Release
   Gesture-driven, not just trigger
   ══════════════════════════════════════════════════════════════ */

import { clamp } from '../../motion/motion.js';
import { performanceManager } from '../performance/performance.js';

export const GestureTypes = {
  swipe: 'swipe',
  drag: 'drag',
  longPress: 'longPress',
  pinch: 'pinch',
  edgeSwipe: 'edgeSwipe',
  pull: 'pull',
  hold: 'hold',
  release: 'release',
};

export const GestureZones = {
  bottom: 'bottom',
  top: 'top',
  left: 'left',
  right: 'right',
  corner: 'corner',
  surface: 'surface',
  center: 'center',
};

class NovaGestureEngine {
  constructor() {
    this.activeGestures = new Map();
    this.handlers = new Map();
    this.config = {
      swipeThreshold: 60,
      longPressDuration: 550,
      pinchThreshold: 10,
      edgeWidth: 24,
      cornerSize: 80,
      velocityThreshold: 700,
    };
    this.touchTargets = new Map();
  }

  /**
   * Attach gesture handling to an element
   */
  attach(element, options = {}) {
    if (!element) return () => {};
    
    const id = `gesture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const state = {
      id,
      element,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      startTime: 0,
      velocityX: 0,
      velocityY: 0,
      pointers: new Map(),
      isDragging: false,
      isLongPress: false,
      longPressTimer: null,
      zone: null,
      type: null,
      progress: 0,
    };

    const handlers = {
      onStart: options.onStart || (() => {}),
      onMove: options.onMove || (() => {}),
      onEnd: options.onEnd || (() => {}),
      onLongPress: options.onLongPress || (() => {}),
      onPinch: options.onPinch || (() => {}),
      isZoneEnabled: options.isZoneEnabled || (() => true),
    };

    this.handlers.set(id, handlers);
    this.activeGestures.set(id, state);

    const getZone = (x, y, rect) => {
      const edgeW = this.config.edgeWidth;
      const cornerS = this.config.cornerSize;
      
      // Corners first
      if ((x < cornerS && y < cornerS) || 
          (x > rect.width - cornerS && y < cornerS) ||
          (x < cornerS && y > rect.height - cornerS) ||
          (x > rect.width - cornerS && y > rect.height - cornerS)) {
        return GestureZones.corner;
      }
      
      if (x < edgeW) return GestureZones.left;
      if (x > rect.width - edgeW) return GestureZones.right;
      if (y < edgeW) return GestureZones.top;
      if (y > rect.height - edgeW) return GestureZones.bottom;
      
      const centerMargin = 0.3;
      const cx = rect.width * centerMargin;
      const cy = rect.height * centerMargin;
      if (x > cx && x < rect.width - cx && y > cy && y < rect.height - cy) {
        return GestureZones.center;
      }
      
      return GestureZones.surface;
    };

    const handlePointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.currentX = e.clientX;
      state.currentY = e.clientY;
      state.startTime = Date.now();
      state.zone = getZone(x, y, rect);
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      
      if (!handlers.isZoneEnabled(state.zone)) return;
      
      // Long press detection
      state.longPressTimer = setTimeout(() => {
        if (!state.isDragging && state.pointers.size === 1) {
          state.isLongPress = true;
          state.type = GestureTypes.longPress;
          handlers.onLongPress({
            x: state.currentX,
            y: state.currentY,
            zone: state.zone,
            target: e.target,
          });
          // Haptic feedback
          try { navigator.vibrate?.(20); } catch {}
        }
      }, this.config.longPressDuration);

      const gestureEvent = {
        id,
        x: state.startX,
        y: state.startY,
        dx: 0,
        dy: 0,
        zone: state.zone,
        pointers: state.pointers.size,
        target: e.target,
        originalEvent: e,
      };

      handlers.onStart(gestureEvent);
      
      try {
        element.setPointerCapture(e.pointerId);
      } catch {}
    };

    const handlePointerMove = (e) => {
      if (!state.pointers.has(e.pointerId)) return;
      
      const prev = state.pointers.get(e.pointerId);
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      const moveDist = Math.hypot(dx, dy);
      
      // Update velocity
      const dt = Math.max(1, Date.now() - state.startTime);
      state.velocityX = dx / (dt / 1000);
      state.velocityY = dy / (dt / 1000);
      
      state.currentX = e.clientX;
      state.currentY = e.clientY;
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      
      // Cancel long press if moved too much
      if (moveDist > 10 && state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
      
      // Detect drag start
      if (!state.isDragging && moveDist > 8) {
        state.isDragging = true;
        state.type = GestureTypes.drag;
        if (state.longPressTimer) {
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
        }
      }
      
      // Pinch detection
      if (state.pointers.size === 2) {
        state.type = GestureTypes.pinch;
        const points = Array.from(state.pointers.values());
        const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const centerX = (points[0].x + points[1].x) / 2;
        const centerY = (points[0].y + points[1].y) / 2;
        
        handlers.onPinch({
          scale: dist / 100, // normalized
          centerX,
          centerY,
          distance: dist,
          zone: state.zone,
        });
        return;
      }
      
      if (!state.isDragging && !state.isLongPress) return;
      
      // Calculate progress based on zone and direction
      let progress = 0;
      const rect = element.getBoundingClientRect();
      
      switch (state.zone) {
        case GestureZones.bottom:
          progress = clamp(-dy / (rect.height * 0.5));
          break;
        case GestureZones.top:
          progress = clamp(dy / (rect.height * 0.42));
          break;
        case GestureZones.right:
          progress = clamp(-dx / (rect.width * 0.62));
          break;
        case GestureZones.left:
          progress = clamp(dx / (rect.width * 0.62));
          break;
        default:
          progress = clamp(moveDist / 200);
      }
      
      state.progress = progress;
      
      const gestureEvent = {
        id,
        x: state.currentX,
        y: state.currentY,
        dx,
        dy,
        vx: state.velocityX,
        vy: state.velocityY,
        velocity: Math.hypot(state.velocityX, state.velocityY),
        progress,
        zone: state.zone,
        type: state.type,
        pointers: state.pointers.size,
        target: e.target,
        originalEvent: e,
      };
      
      handlers.onMove(gestureEvent);
    };

    const handlePointerUp = (e) => {
      if (!state.pointers.has(e.pointerId)) return;
      
      state.pointers.delete(e.pointerId);
      
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
      
      const dx = state.currentX - state.startX;
      const dy = state.currentY - state.startY;
      const dt = Math.max(1, Date.now() - state.startTime);
      const velocity = Math.hypot(state.velocityX, state.velocityY);
      
      // Determine if it's a swipe
      let isSwipe = false;
      if (!state.isLongPress && Math.abs(dx) > this.config.swipeThreshold || 
          Math.abs(dy) > this.config.swipeThreshold) {
        if (velocity > 300) {
          isSwipe = true;
          state.type = GestureTypes.swipe;
        }
      }
      
      const isCommit = 
        state.progress > 0.34 || 
        velocity > this.config.velocityThreshold ||
        isSwipe;
      
      const gestureEvent = {
        id,
        x: state.currentX,
        y: state.currentY,
        dx,
        dy,
        vx: state.velocityX,
        vy: state.velocityY,
        velocity,
        progress: state.progress,
        commit: isCommit,
        isSwipe,
        zone: state.zone,
        type: state.type,
        pointers: state.pointers.size,
        target: e.target,
        originalEvent: e,
      };
      
      handlers.onEnd(gestureEvent);
      
      // Reset state
      state.isDragging = false;
      state.isLongPress = false;
      state.type = null;
      state.progress = 0;
      
      try {
        element.releasePointerCapture(e.pointerId);
      } catch {}
    };

    const handlePointerCancel = (e) => {
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
      state.pointers.delete(e.pointerId);
      state.isDragging = false;
      state.isLongPress = false;
    };

    element.addEventListener('pointerdown', handlePointerDown, { passive: false });
    element.addEventListener('pointermove', handlePointerMove, { passive: false });
    element.addEventListener('pointerup', handlePointerUp, { passive: false });
    element.addEventListener('pointercancel', handlePointerCancel, { passive: false });

    // Return detach function
    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('pointercancel', handlePointerCancel);
      if (state.longPressTimer) clearTimeout(state.longPressTimer);
      this.activeGestures.delete(id);
      this.handlers.delete(id);
    };
  }

  /**
   * Create a draggable helper
   */
  draggable(element, options = {}) {
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    let isDragging = false;
    
    const onStart = options.onStart || (() => {});
    const onMove = options.onMove || (() => {});
    const onEnd = options.onEnd || (() => {});
    
    return this.attach(element, {
      onStart: (e) => {
        startX = e.x;
        startY = e.y;
        currentX = e.x;
        currentY = e.y;
        onStart(e);
      },
      onMove: (e) => {
        if (!isDragging && Math.hypot(e.dx, e.dy) > 5) {
          isDragging = true;
        }
        currentX = e.x;
        currentY = e.y;
        onMove(e);
      },
      onEnd: (e) => {
        onEnd(e);
        isDragging = false;
      },
      isZoneEnabled: options.isZoneEnabled,
    });
  }

  /**
   * Detect if gesture should be handled
   */
  shouldHandle(zone, state) {
    const handler = this.handlers.values().next().value;
    if (handler?.isZoneEnabled) {
      return handler.isZoneEnabled(zone);
    }
    return true;
  }
}

export const gestureEngine = new NovaGestureEngine();
export default gestureEngine;
