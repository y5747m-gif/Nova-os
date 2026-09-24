/* ══════════════════════════════════════════════════════════════
   NOVA SETTINGS — per spec #54-56, #58
   Sections: Appearance, Motion, Glass, Sound, Haptics, Gestures,
   Notifications, Privacy, Security, AI, Battery, Performance,
   Accessibility, System
   Glass Settings: Clear/Soft/Solid, Transparency, Blur, Edge Glow
   Motion Settings: Cinematic/Balanced/Fast/Minimal/Reduced
   ══════════════════════════════════════════════════════════════ */

import { performanceManager, PerformanceModes } from '../performance/performance.js';
import { glassManager, GlassLevels } from '../glass/glass.js';
import { hapticsEngine } from '../haptics/haptics.js';
import { audioEngine } from '../audio/audio.js';

export const SettingsSections = {
  appearance: { id: 'appearance', label: 'المظهر', icon: 'palette', desc: 'الوضع الداكن والفاتح والألوان' },
  motion: { id: 'motion', label: 'الحركة', icon: 'motion', desc: 'ملف الحركة والسرعة' },
  glass: { id: 'glass', label: 'الزجاج', icon: 'glass', desc: 'مستوى الشفافية والتمويه' },
  sound: { id: 'sound', label: 'الصوت', icon: 'sound', desc: 'أصوات النظام' },
  haptics: { id: 'haptics', label: 'الاهتزاز', icon: 'vibrate', desc: 'ردود الفعل اللمسية' },
  gestures: { id: 'gestures', label: 'الإيماءات', icon: 'gesture', desc: 'التحكم بالإيماءات' },
  notifications: { id: 'notifications', label: 'الإشعارات', icon: 'bell', desc: 'NOVA FLOW' },
  privacy: { id: 'privacy', label: 'الخصوصية', icon: 'privacy', desc: 'الأمان والخصوصية' },
  security: { id: 'security', label: 'الأمان', icon: 'security', desc: 'مركز الأمان' },
  ai: { id: 'ai', label: 'الذكاء الاصطناعي', icon: 'ai', desc: 'NOVA AI' },
  battery: { id: 'battery', label: 'البطارية', icon: 'battery', desc: 'إدارة الطاقة' },
  performance: { id: 'performance', label: 'الأداء', icon: 'performance', desc: 'وضع الأداء' },
  accessibility: { id: 'accessibility', label: 'إمكانية الوصول', icon: 'accessibility', desc: 'تسهيلات الاستخدام' },
  system: { id: 'system', label: 'النظام', icon: 'system', desc: 'معلومات النظام' },
};

export const MotionPresets = {
  cinematic: { id: 'cinematic', label: 'Cinematic', desc: 'الحركة الكاملة: أقواس، عمق، بارالاكس' },
  balanced: { id: 'balanced', label: 'Balanced', desc: 'الافتراضي: نفس الفيزياء بحركة أقصر' },
  fast: { id: 'fast', label: 'Fast', desc: 'أسرع وأكثر صلابة' },
  minimal: { id: 'minimal', label: 'Minimal', desc: 'شبه ساكن: بدون قوس ولا ارتداد' },
  reduced: { id: 'reduced', label: 'Reduced Motion', desc: 'مخصص لإمكانية الوصول: تلاشي فقط' },
};

export const GlassPresets = {
  clear: { id: 'clear', label: 'Clear', desc: 'شفافية عالية' },
  soft: { id: 'soft', label: 'Soft', desc: 'شفافية متوسطة' },
  solid: { id: 'solid', label: 'Solid', desc: 'شفافية قليلة وأداء أعلى' },
};

class NovaSettingsManager {
  constructor() {
    this.settings = this.loadSettings();
    this.listeners = new Set();
  }

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('nova.settings.v2') || '{}');
      return {
        appearance: { mode: saved.appearance?.mode || 'dark', accent: saved.appearance?.accent || 'violet' },
        motion: { profile: saved.motion?.profile || 'balanced', theme: saved.motion?.theme || 'aurora' },
        glass: { level: saved.glass?.level || 'soft', transparency: saved.glass?.transparency ?? 0.6, blur: saved.glass?.blur ?? 12, edgeGlow: saved.glass?.edgeGlow ?? 0.12, adaptive: saved.glass?.adaptive ?? true },
        sound: { enabled: saved.sound?.enabled ?? true, volume: saved.sound?.volume ?? 0.35 },
        haptics: { enabled: saved.haptics?.enabled ?? true, intensity: saved.haptics?.intensity ?? 0.7 },
        gestures: { enabled: saved.gestures?.enabled ?? true, sensitivity: saved.gestures?.sensitivity ?? 0.7 },
        notifications: { dnd: saved.notifications?.dnd ?? false, quietHours: saved.notifications?.quietHours ?? false },
        privacy: { analytics: saved.privacy?.analytics ?? false },
        performance: { mode: saved.performance?.mode || 'balanced' },
        accessibility: { reducedMotion: saved.accessibility?.reducedMotion ?? false, highContrast: saved.accessibility?.highContrast ?? false, largeText: saved.accessibility?.largeText ?? false, reduceTransparency: saved.accessibility?.reduceTransparency ?? false },
        ...saved,
      };
    } catch {
      return {
        appearance: { mode: 'dark', accent: 'violet' },
        motion: { profile: 'balanced', theme: 'aurora' },
        glass: { level: 'soft', transparency: 0.6, blur: 12, edgeGlow: 0.12, adaptive: true },
        sound: { enabled: true, volume: 0.35 },
        haptics: { enabled: true, intensity: 0.7 },
        gestures: { enabled: true, sensitivity: 0.7 },
        notifications: { dnd: false, quietHours: false },
        privacy: { analytics: false },
        performance: { mode: 'balanced' },
        accessibility: { reducedMotion: false, highContrast: false, largeText: false, reduceTransparency: false },
      };
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('nova.settings.v2', JSON.stringify(this.settings));
    } catch {}
  }

  get(section, key) {
    return key ? this.settings[section]?.[key] : this.settings[section];
  }

  set(section, key, value) {
    if (typeof key === 'object') {
      // set(section, {key: value})
      this.settings[section] = { ...this.settings[section], ...key };
    } else {
      if (!this.settings[section]) this.settings[section] = {};
      this.settings[section][key] = value;
    }
    this.saveSettings();
    this.applySettings(section, key, value);
    this.notify(section, key, value);
  }

  applySettings(section, key, value) {
    try {
      switch (section) {
        case 'appearance':
          if (key === 'mode' || key === undefined) {
            document.body.dataset.mode = this.settings.appearance.mode;
          }
          if (key === 'accent' || key === undefined) {
            document.body.dataset.accent = this.settings.appearance.accent;
          }
          break;
        case 'motion':
          if (key === 'profile') {
            document.body.dataset.profile = value;
            // Would call setProfile from config.js
            window.dispatchEvent(new CustomEvent('nova:settings-motion', { detail: { profile: value } }));
          }
          if (key === 'theme') {
            document.body.dataset.theme = value;
            window.dispatchEvent(new CustomEvent('nova:settings-theme', { detail: { theme: value } }));
          }
          break;
        case 'glass':
          if (key === 'level') {
            glassManager.setLevel(value);
          }
          if (key === 'adaptive') {
            glassManager.setAdaptive(value);
          }
          break;
        case 'sound':
          if (key === 'enabled') audioEngine.setEnabled(value);
          if (key === 'volume') audioEngine.setVolume(value);
          break;
        case 'haptics':
          if (key === 'enabled') hapticsEngine.setEnabled(value);
          break;
        case 'performance':
          if (key === 'mode') performanceManager.setMode(value);
          break;
        case 'accessibility':
          if (key === 'reducedMotion') {
            document.body.dataset.motion = value ? 'reduced' : 'normal';
          }
          if (key === 'reduceTransparency') {
            document.body.dataset.reduceTransparency = value ? '1' : '0';
            if (value) {
              glassManager.setLevel('solid');
            }
          }
          if (key === 'highContrast') {
            document.body.dataset.highContrast = value ? '1' : '0';
          }
          if (key === 'largeText') {
            document.body.dataset.largeText = value ? '1' : '0';
          }
          break;
      }
    } catch {}
  }

  applyAll() {
    for (const [section, values] of Object.entries(this.settings)) {
      for (const [key, value] of Object.entries(values)) {
        this.applySettings(section, key, value);
      }
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(section, key, value) {
    for (const fn of this.listeners) {
      try { fn(section, key, value); } catch {}
    }
  }

  /**
   * Create Settings surface UI
   */
  createSurface(container, options = {}) {
    const initialSection = options.section || 'appearance';
    
    const surface = document.createElement('div');
    surface.className = 'nova-settings';
    surface.innerHTML = `
      <div class="nova-settings__sidebar">
        <h2 class="nova-settings__title">الإعدادات</h2>
        <div class="nova-settings__nav"></div>
      </div>
      <div class="nova-settings__content">
        <div class="nova-settings__header">
          <h3 class="nova-settings__section-title"></h3>
          <p class="nova-settings__section-desc"></p>
        </div>
        <div class="nova-settings__body"></div>
      </div>
    `;

    const nav = surface.querySelector('.nova-settings__nav');
    const sectionTitle = surface.querySelector('.nova-settings__section-title');
    const sectionDesc = surface.querySelector('.nova-settings__section-desc');
    const body = surface.querySelector('.nova-settings__body');

    let currentSection = initialSection;

    const renderNav = () => {
      nav.innerHTML = '';
      for (const section of Object.values(SettingsSections)) {
        const el = document.createElement('button');
        el.className = `nova-settings__nav-item ${section.id === currentSection ? 'nova-settings__nav-item--active' : ''}`;
        el.innerHTML = `
          <span class="nova-settings__nav-icon">${section.icon}</span>
          <span class="nova-settings__nav-label">${section.label}</span>
        `;
        el.addEventListener('click', () => {
          currentSection = section.id;
          renderNav();
          renderSection();
        });
        nav.appendChild(el);
      }
    };

    const renderSection = () => {
      const section = SettingsSections[currentSection];
      if (!section) return;
      
      sectionTitle.textContent = section.label;
      sectionDesc.textContent = section.desc;
      
      body.innerHTML = '';
      
      switch (currentSection) {
        case 'appearance':
          renderAppearance(body);
          break;
        case 'motion':
          renderMotion(body);
          break;
        case 'glass':
          renderGlass(body);
          break;
        case 'sound':
          renderSound(body);
          break;
        case 'haptics':
          renderHaptics(body);
          break;
        case 'performance':
          renderPerformance(body);
          break;
        case 'accessibility':
          renderAccessibility(body);
          break;
        default:
          body.innerHTML = `<div class="nova-settings__placeholder">إعدادات ${section.label} — قريباً</div>`;
      }
    };

    const renderAppearance = (container) => {
      container.innerHTML = `
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">الوضع</h4>
          <div class="nova-settings__chips" data-setting="appearance.mode">
            <button data-value="dark" class="nova-settings__chip">داكن</button>
            <button data-value="light" class="nova-settings__chip">فاتح</button>
          </div>
        </div>
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">اللون المميز</h4>
          <div class="nova-settings__chips" data-setting="appearance.accent">
            <button data-value="violet" class="nova-settings__chip" style="--chip-color: #6C5CE7">بنفسجي</button>
            <button data-value="aurora" class="nova-settings__chip" style="--chip-color: #4ADE80">شفق</button>
            <button data-value="liquid" class="nova-settings__chip" style="--chip-color: #22D3EE">سائل</button>
            <button data-value="neon" class="nova-settings__chip" style="--chip-color: #FF3D81">نيون</button>
          </div>
        </div>
      `;
      bindChips(container);
    };

    const renderMotion = (container) => {
      const motionHtml = Object.values(MotionPresets).map(p => 
        `<button data-value="${p.id}" class="nova-settings__chip">${p.label}<small>${p.desc}</small></button>`
      ).join('');
      
      container.innerHTML = `
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">ملف الحركة</h4>
          <div class="nova-settings__chips nova-settings__chips--vertical" data-setting="motion.profile">
            ${motionHtml}
          </div>
        </div>
      `;
      bindChips(container);
    };

    const renderGlass = (container) => {
      const glassHtml = Object.values(GlassPresets).map(p =>
        `<button data-value="${p.id}" class="nova-settings__chip">${p.label}<small>${p.desc}</small></button>`
      ).join('');
      
      container.innerHTML = `
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">مستوى الزجاج</h4>
          <div class="nova-settings__chips" data-setting="glass.level">
            ${glassHtml}
          </div>
          <p class="nova-settings__hint">Presets سهلة بدل عشرات الإعدادات المعقدة</p>
        </div>
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">الزجاج التكيفي</h4>
          <label class="nova-settings__toggle">
            <input type="checkbox" data-setting="glass.adaptive" ${this.get('glass', 'adaptive') ? 'checked' : ''} />
            <span>تكييف تلقائي حسب أداء الجهاز</span>
          </label>
        </div>
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">الشفافية</h4>
          <input type="range" min="0" max="1" step="0.1" data-setting="glass.transparency" value="${this.get('glass', 'transparency')}" class="nova-settings__slider" />
        </div>
      `;
      bindChips(container);
      bindToggles(container);
      bindSliders(container);
    };

    const renderSound = (container) => {
      container.innerHTML = `
        <div class="nova-settings__group">
          <label class="nova-settings__toggle">
            <input type="checkbox" data-setting="sound.enabled" ${this.get('sound', 'enabled') ? 'checked' : ''} />
            <span>تفعيل الأصوات</span>
          </label>
        </div>
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">مستوى الصوت</h4>
          <input type="range" min="0" max="1" step="0.1" data-setting="sound.volume" value="${this.get('sound', 'volume')}" class="nova-settings__slider" />
        </div>
      `;
      bindToggles(container);
      bindSliders(container);
    };

    const renderHaptics = (container) => {
      container.innerHTML = `
        <div class="nova-settings__group">
          <label class="nova-settings__toggle">
            <input type="checkbox" data-setting="haptics.enabled" ${this.get('haptics', 'enabled') ? 'checked' : ''} />
            <span>تفعيل الاهتزاز</span>
          </label>
        </div>
      `;
      bindToggles(container);
    };

    const renderPerformance = (container) => {
      const modesHtml = Object.values(PerformanceModes).map(m =>
        `<button data-value="${m.id}" class="nova-settings__chip">${m.name}<small>${m.description}</small></button>`
      ).join('');
      
      container.innerHTML = `
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">وضع الأداء</h4>
          <div class="nova-settings__chips nova-settings__chips--vertical" data-setting="performance.mode">
            ${modesHtml}
          </div>
        </div>
        <div class="nova-settings__group">
          <h4 class="nova-settings__group-title">معلومات الأداء</h4>
          <div class="nova-settings__debug"></div>
        </div>
      `;
      
      const debugEl = container.querySelector('.nova-settings__debug');
      const updateDebug = () => {
        const info = performanceManager.getDebugInfo();
        debugEl.innerHTML = `
          <div>FPS: ${info.fps} | الوضع: ${info.mode} | الطبقة: ${info.tier}</div>
          <div>الحرارة: ${info.thermal} | الذاكرة: ${info.memory}% | Blur: ${info.blur}px</div>
        `;
      };
      updateDebug();
      const interval = setInterval(updateDebug, 1000);
      
      bindChips(container);
      
      // Cleanup on destroy
      container._cleanup = () => clearInterval(interval);
    };

    const renderAccessibility = (container) => {
      container.innerHTML = `
        <div class="nova-settings__group">
          <label class="nova-settings__toggle">
            <input type="checkbox" data-setting="accessibility.reducedMotion" ${this.get('accessibility', 'reducedMotion') ? 'checked' : ''} />
            <span>تقليل الحركة</span>
          </label>
          <p class="nova-settings__hint">تقليل الحركة للمستخدمين الذين يفضلون ذلك</p>
        </div>
        <div class="nova-settings__group">
          <label class="nova-settings__toggle">
            <input type="checkbox" data-setting="accessibility.reduceTransparency" ${this.get('accessibility', 'reduceTransparency') ? 'checked' : ''} />
            <span>تقليل الشفافية</span>
          </label>
          <p class="nova-settings__hint">تحويل Glass surfaces إلى Solid surfaces</p>
        </div>
        <div class="nova-settings__group">
          <label class="nova-settings__toggle">
            <input type="checkbox" data-setting="accessibility.highContrast" ${this.get('accessibility', 'highContrast') ? 'checked' : ''} />
            <span>تباين عالي</span>
          </label>
        </div>
        <div class="nova-settings__group">
          <label class="nova-settings__toggle">
            <input type="checkbox" data-setting="accessibility.largeText" ${this.get('accessibility', 'largeText') ? 'checked' : ''} />
            <span>نص كبير</span>
          </label>
        </div>
      `;
      bindToggles(container);
    };

    const bindChips = (container) => {
      container.querySelectorAll('[data-setting]').forEach(group => {
        const settingPath = group.dataset.setting;
        const [section, key] = settingPath.split('.');
        const currentValue = this.get(section, key);
        
        group.querySelectorAll('[data-value]').forEach(chip => {
          if (chip.dataset.value === currentValue) {
            chip.classList.add('nova-settings__chip--active');
          }
          chip.addEventListener('click', () => {
            group.querySelectorAll('.nova-settings__chip').forEach(c => c.classList.remove('nova-settings__chip--active'));
            chip.classList.add('nova-settings__chip--active');
            this.set(section, key, chip.dataset.value);
          });
        });
      });
    };

    const bindToggles = (container) => {
      container.querySelectorAll('input[type="checkbox"][data-setting]').forEach(toggle => {
        toggle.addEventListener('change', () => {
          const [section, key] = toggle.dataset.setting.split('.');
          this.set(section, key, toggle.checked);
        });
      });
    };

    const bindSliders = (container) => {
      container.querySelectorAll('input[type="range"][data-setting]').forEach(slider => {
        slider.addEventListener('input', () => {
          const [section, key] = slider.dataset.setting.split('.');
          const value = parseFloat(slider.value);
          this.set(section, key, value);
        });
      });
    };

    renderNav();
    renderSection();

    container.appendChild(surface);

    return {
      element: surface,
      destroy: () => {
        if (body._cleanup) body._cleanup();
        surface.remove();
      },
    };
  }
}

export const settingsManager = new NovaSettingsManager();
export default settingsManager;
