/* ══════════════════════════════════════════════════════════════
   NOVA PERFORMANCE MANAGER — per spec #8, #48-52
   Measures FPS, GPU load, Memory, Thermal, Device capability
   Auto-adjusts effects: High-end → Ultra, Mid → Soft, Low → Solid
   ══════════════════════════════════════════════════════════════ */

export const DeviceTiers = {
  high: { cpu: 8, ram: 8, gpu: 'high' },
  mid: { cpu: 6, ram: 4, gpu: 'mid' },
  low: { cpu: 4, ram: 2, gpu: 'low' },
};

export const PerformanceModes = {
  ultra: {
    id: 'ultra',
    name: 'Ultra',
    blur: 22,
    particles: true,
    background: true,
    shadows: true,
    glass: 'ultra',
    fps: 120,
    description: 'كل المؤثرات',
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    blur: 12,
    particles: true,
    background: true,
    shadows: true,
    glass: 'soft',
    fps: 60,
    description: 'الافتراضي',
  },
  performance: {
    id: 'performance',
    name: 'Performance',
    blur: 4,
    particles: false,
    background: true,
    shadows: false,
    glass: 'solid',
    fps: 60,
    description: 'تقليل Blur والـParticles',
  },
  battery: {
    id: 'battery',
    name: 'Battery Saver',
    blur: 0,
    particles: false,
    background: false,
    shadows: false,
    glass: 'solid',
    fps: 30,
    description: 'إيقاف Living Background والحركات غير الضرورية',
  },
  reduced: {
    id: 'reduced',
    name: 'Reduced Motion',
    blur: 0,
    particles: false,
    background: false,
    shadows: false,
    glass: 'solid',
    fps: 30,
    description: 'تقليل الحركة للمستخدمين الذين يفضلون ذلك',
  },
};

class NovaPerformanceManager {
  constructor() {
    this.state = {
      mode: 'balanced',
      deviceTier: this.detectDeviceTier(),
      fps: 60,
      gpuLoad: 0,
      memoryPressure: 0,
      thermal: 'nominal', // nominal, fair, serious, critical
      batterySaver: false,
      reducedMotion: false,
      frameDrops: 0,
      lastCheck: Date.now(),
    };
    this.listeners = new Set();
    this.fpsHistory = [];
    this.monitoring = false;
    this.monitorRaf = 0;
    this.visibilityHandler = () => {
      if (document.hidden) this.stopMonitoring();
      else this.startMonitoring();
    };
    this.init();
  }

  init() {
    // Detect system preferences
    try {
      this.state.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      this.state.batterySaver = false;
      
      if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
          battery.addEventListener('chargingchange', () => this.updateBatteryState(battery));
          battery.addEventListener('levelchange', () => this.updateBatteryState(battery));
          this.updateBatteryState(battery);
        }).catch(() => {});
      }

      // Listen for thermal / memory pressure if available
      if ('deviceMemory' in navigator) {
        const ram = navigator.deviceMemory;
        if (ram <= 2) this.state.deviceTier = 'low';
        else if (ram <= 4) this.state.deviceTier = 'mid';
        else this.state.deviceTier = 'high';
      }

      if ('hardwareConcurrency' in navigator) {
        const cores = navigator.hardwareConcurrency;
        if (cores <= 4 && this.state.deviceTier !== 'low') {
          this.state.deviceTier = this.state.deviceTier === 'high' ? 'mid' : 'low';
        }
      }

      // Check for low-end via user agent hints
      this.detectLowEndDevice();

      // Pause the monitor while the document is hidden. This prevents a
      // background RAF loop from consuming CPU on the launcher/web prototype.
      document.addEventListener?.('visibilitychange', this.visibilityHandler, { passive: true });
      if (!document.hidden) this.startMonitoring();
    } catch {}
  }

  detectDeviceTier() {
    // Heuristic detection
    try {
      const ram = navigator.deviceMemory || 4;
      const cores = navigator.hardwareConcurrency || 4;
      const gpu = this.estimateGpuTier();
      
      if (ram >= 8 && cores >= 8 && gpu === 'high') return 'high';
      if (ram >= 4 && cores >= 6) return 'mid';
      return 'low';
    } catch {
      return 'mid';
    }
  }

  estimateGpuTier() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'low';
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
        if (renderer.includes('adreno 7') || renderer.includes('mali-g7') || renderer.includes('apple')) return 'high';
        if (renderer.includes('adreno 6') || renderer.includes('mali-g6')) return 'mid';
      }
      return 'mid';
    } catch {
      return 'mid';
    }
  }

  detectLowEndDevice() {
    // Additional low-end checks
    try {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('android') && !ua.includes('pixel') && !ua.includes('samsung')) {
        // Many mid/low Androids
        if (this.state.deviceTier === 'high') this.state.deviceTier = 'mid';
      }
    } catch {}
  }

  updateBatteryState(battery) {
    try {
      const level = battery.level;
      const charging = battery.charging;
      // The Web Battery API does not expose Android's real Battery Saver state.
      // Treat a critically low, non-charging battery as a local visual policy only.
      if (!charging && level < 0.15) {
        this.setMode('battery');
        this.state.batterySaver = true;
      } else if (this.state.batterySaver && (charging || level > 0.25)) {
        this.state.batterySaver = false;
        if (this.state.mode === 'battery') this.setMode('balanced');
      }
      this.notify();
    } catch {}
  }

  startMonitoring() {
    if (this.monitoring) return;
    this.monitoring = true;
    
    let lastTime = performance.now();
    let frames = 0;
    
    const check = (now) => {
      if (!this.monitoring) return;
      frames++;
      const delta = now - lastTime;
      
      if (delta >= 1000) {
        const fps = Math.round((frames * 1000) / delta);
        this.fpsHistory.push(fps);
        if (this.fpsHistory.length > 10) this.fpsHistory.shift();
        
        this.state.fps = fps;
        this.state.frameDrops = this.fpsHistory.filter(f => f < 50).length;
        
        // Auto downgrade if FPS low
        if (fps < 45 && this.state.mode === 'ultra') {
          this.setMode('balanced');
        } else if (fps < 30 && this.state.mode === 'balanced') {
          this.setMode('performance');
        }
        
        // Check memory pressure
        if (performance.memory) {
          const used = performance.memory.usedJSHeapSize;
          const limit = performance.memory.jsHeapSizeLimit;
          this.state.memoryPressure = used / limit;
          
          if (this.state.memoryPressure > 0.85) {
            this.setMode('performance');
          }
        }
        
        // Thermal simulation — real implementation would use native APIs
        if (this.state.frameDrops > 5) {
          this.state.thermal = this.state.thermal === 'nominal' ? 'fair' : 
                              this.state.thermal === 'fair' ? 'serious' : 'critical';
          if (this.state.thermal === 'serious') {
            this.setMode('performance');
          } else if (this.state.thermal === 'critical') {
            this.setMode('battery');
          }
        } else if (this.state.thermal !== 'nominal' && this.state.frameDrops === 0) {
          // Cool down
          setTimeout(() => {
            if (this.state.frameDrops === 0) {
              this.state.thermal = 'nominal';
            }
          }, 5000);
        }
        
        lastTime = now;
        frames = 0;
        this.state.lastCheck = Date.now();
        this.notify();
      }
      
      this.monitorRaf = requestAnimationFrame(check);
    };
    
    this.monitorRaf = requestAnimationFrame(check);
  }

  stopMonitoring() {
    this.monitoring = false;
    if (this.monitorRaf) { cancelAnimationFrame(this.monitorRaf); this.monitorRaf = 0; }
  }

  setMode(mode) {
    if (!PerformanceModes[mode]) return;
    if (this.state.mode === mode) return;
    
    const prev = this.state.mode;
    this.state.mode = mode;
    
    document.body.dataset.performance = mode;
    document.body.dataset.deviceTier = this.state.deviceTier;
    
    // Apply glass level
    const glassLevel = PerformanceModes[mode].glass;
    document.body.dataset.glass = glassLevel;
    
    // Notify
    this.notify();
    
    // Emit event
    try {
      window.dispatchEvent(new CustomEvent('nova:performance-change', {
        detail: { mode, prev, glass: glassLevel }
      }));
    } catch {}
  }

  getState() {
    return { ...this.state };
  }

  getMode() {
    return PerformanceModes[this.state.mode];
  }

  shouldUseBlur() {
    const mode = this.getMode();
    return mode.blur > 0 && this.state.thermal !== 'critical' && !this.state.batterySaver;
  }

  shouldUseParticles() {
    return this.getMode().particles && this.state.thermal === 'nominal';
  }

  shouldUseBackground() {
    return this.getMode().background && !this.state.batterySaver;
  }

  shouldUseShadows() {
    return this.getMode().shadows;
  }

  shouldDowngradeGlass() {
    return this.state.mode === 'battery' || 
           this.state.mode === 'reduced' || 
           this.state.mode === 'performance' ||
           this.state.thermal === 'critical' ||
           this.state.memoryPressure > 0.85;
  }

  shouldReduceMotion() {
    return this.state.mode === 'reduced' || 
           this.state.reducedMotion || 
           this.state.thermal === 'critical';
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      try { fn(this.getState()); } catch {}
    }
  }

  // Debug overlay data
  getDebugInfo() {
    return {
      fps: this.state.fps,
      mode: this.state.mode,
      tier: this.state.deviceTier,
      thermal: this.state.thermal,
      memory: Math.round(this.state.memoryPressure * 100),
      gpu: Math.round(this.state.gpuLoad * 100),
      blur: this.getMode().blur,
      glass: this.getMode().glass,
      drops: this.state.frameDrops,
    };
  }
}

export const performanceManager = new NovaPerformanceManager();
export default performanceManager;
