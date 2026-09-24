/* ══════════════════════════════════════════════════════════════
   NOVA AUDIO ENGINE — per spec #58, #74
   Sound Pack special for NOVA: short, quiet, clear, not annoying
   Not similar to other systems
   ══════════════════════════════════════════════════════════════ */

export const SoundEvents = {
  open: 'open',
  close: 'close',
  success: 'success',
  error: 'error',
  tick: 'tick',
  defer: 'defer',
  orb: 'orb',
  sweep: 'sweep',
  call: 'call',
  notification: 'notification',
  charging: 'charging',
  unlock: 'unlock',
  lock: 'lock',
};

export const SoundPack = {
  open: { freq: [440, 660], duration: 90, type: 'sine', volume: 0.3, attack: 0.01, release: 0.08 },
  close: { freq: [330, 220], duration: 130, type: 'sine', volume: 0.25, attack: 0.01, release: 0.12 },
  success: { freq: [660, 880], duration: 70, gap: 60, type: 'sine', volume: 0.35 },
  error: { freq: [520, 300], duration: 110, type: 'saw', volume: 0.3 },
  tick: { freq: 0, duration: 12, type: 'noise', volume: 0.15 },
  defer: { freq: [400, 350], duration: 80, type: 'sine', volume: 0.2 },
  orb: { freq: [520, 620], duration: 100, type: 'sine', volume: 0.25 },
  sweep: { freq: [300, 150], duration: 200, type: 'sine', volume: 0.2 },
  charging: { freq: [440, 550, 660], duration: 120, type: 'sine', volume: 0.3 },
  unlock: { freq: [440, 660, 880], duration: 150, type: 'sine', volume: 0.3 },
};

class NovaAudioEngine {
  constructor() {
    this.enabled = true;
    this.volume = 0.35;
    this.context = null;
    this.initialized = false;
    this.soundsPlayed = 0;
    this.lastSoundTime = 0;
    this.init();
  }

  init() {
    try {
      const saved = localStorage.getItem('nova.sound.enabled');
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
      const vol = localStorage.getItem('nova.sound.volume');
      if (vol !== null) {
        this.volume = parseFloat(vol);
      }
    } catch {}
  }

  async ensureContext() {
    if (this.context) return this.context;
    
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      
      this.context = new AudioContext();
      this.initialized = true;
      
      // Resume if suspended
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      
      return this.context;
    } catch {
      return null;
    }
  }

  async play(eventType) {
    if (!this.enabled) return;
    if (Date.now() - this.lastSoundTime < 50) return; // debounce
    
    const config = SoundPack[eventType];
    if (!config) return;
    
    const ctx = await this.ensureContext();
    if (!ctx) return;
    
    try {
      if (config.type === 'noise') {
        this.playNoise(ctx, config);
      } else if (Array.isArray(config.freq) && config.gap) {
        // Double tone (success)
        this.playTone(ctx, config.freq[0], config.duration, config);
        setTimeout(() => {
          this.playTone(ctx, config.freq[1], config.duration, config);
        }, config.gap);
      } else if (Array.isArray(config.freq) && config.freq.length > 2) {
        // Charging, unlock — arpeggio
        config.freq.forEach((freq, i) => {
          setTimeout(() => {
            this.playTone(ctx, freq, config.duration / config.freq.length, config);
          }, i * (config.duration / config.freq.length));
        });
      } else if (Array.isArray(config.freq)) {
        // Sweep from first to second
        this.playSweep(ctx, config.freq[0], config.freq[1], config.duration, config);
      } else {
        this.playTone(ctx, config.freq, config.duration, config);
      }
      
      this.soundsPlayed++;
      this.lastSoundTime = Date.now();
    } catch {}
  }

  playTone(ctx, frequency, duration, config) {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      oscillator.type = config.type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        (config.volume || 0.3) * this.volume,
        ctx.currentTime + (config.attack || 0.01)
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + duration / 1000
      );
      
      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration / 1000 + 0.1);
    } catch {}
  }

  playSweep(ctx, fromFreq, toFreq, duration, config) {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.type = config.type || 'sine';
      oscillator.frequency.setValueAtTime(fromFreq, ctx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(toFreq, ctx.currentTime + duration / 1000);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        (config.volume || 0.3) * this.volume,
        ctx.currentTime + 0.01
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + duration / 1000
      );
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration / 1000 + 0.1);
    } catch {}
  }

  playNoise(ctx, config) {
    try {
      const bufferSize = ctx.sampleRate * (config.duration / 1000);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime((config.volume || 0.15) * this.volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration / 1000);
      
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      source.start();
    } catch {}
  }

  // Specific methods
  open() { return this.play('open'); }
  close() { return this.play('close'); }
  success() { return this.play('success'); }
  error() { return this.play('error'); }
  tick() { return this.play('tick'); }

  setEnabled(enabled) {
    this.enabled = enabled;
    try {
      localStorage.setItem('nova.sound.enabled', String(enabled));
    } catch {}
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem('nova.sound.volume', String(this.volume));
    } catch {}
  }

  // For initialization on user gesture
  async initAudio() {
    await this.ensureContext();
  }
}

export const audioEngine = new NovaAudioEngine();
export default audioEngine;
