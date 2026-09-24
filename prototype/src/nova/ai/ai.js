/* ══════════════════════════════════════════════════════════════
   NOVA AI — per spec #37-38, #58
   Assistant part of system, interface: NOVA ORB
   User can: write, speak, upload file, request Action
   e.g., "افتح آخر Workspace", "ابحث عن الصور الخاصة بالرحلة"
   Cannot do sensitive actions without permissions + confirmation
   Animation: Orb expands when listening, inner light when thinking,
   text appears gradually but not exaggerated streaming
   ══════════════════════════════════════════════════════════════ */

import NovaMotion from '../../motion/motion.js';

export const AIStates = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  processing: 'processing',
  success: 'success',
  error: 'error',
};

export const AICapabilities = {
  openWorkspace: { id: 'openWorkspace', label: 'افتح مساحة', needsConfirm: false },
  searchPhotos: { id: 'searchPhotos', label: 'ابحث عن الصور', needsConfirm: false },
  listApps: { id: 'listApps', label: 'التطبيقات المفتوحة', needsConfirm: false },
  createSpace: { id: 'createSpace', label: 'أنشئ مساحة', needsConfirm: true },
  deleteFile: { id: 'deleteFile', label: 'احذف ملف', needsConfirm: true },
  sendMessage: { id: 'sendMessage', label: 'أرسل رسالة', needsConfirm: true },
};

class NovaAIEngine {
  constructor() {
    this.state = AIStates.idle;
    this.history = [];
    this.orbElement = null;
    this.listeners = new Set();
    this.init();
  }

  init() {
    try {
      const saved = JSON.parse(localStorage.getItem('nova.ai.history') || '[]');
      this.history = saved.slice(-50);
    } catch {}
  }

  saveHistory() {
    try {
      localStorage.setItem('nova.ai.history', JSON.stringify(this.history.slice(-50)));
    } catch {}
  }

  setState(newState) {
    const prev = this.state;
    this.state = newState;
    
    // Update orb if exists
    if (this.orbElement) {
      this.updateOrbState(this.orbElement, newState);
    }
    
    // Notify
    for (const fn of this.listeners) {
      try { fn(newState, prev); } catch {}
    }
    
    try {
      window.dispatchEvent(new CustomEvent('nova:ai-state', {
        detail: { state: newState, prev }
      }));
    } catch {}
  }

  updateOrbState(orbEl, state) {
    if (!orbEl) return;
    
    orbEl.dataset.aiState = state;
    
    switch (state) {
      case AIStates.idle:
        orbEl.style.transform = 'scale(1)';
        orbEl.style.animation = 'nova-orb-breathe 3s ease-in-out infinite';
        break;
      case AIStates.listening:
        orbEl.style.transform = 'scale(1.08)';
        orbEl.style.animation = 'nova-orb-pulse 1s ease-in-out infinite';
        break;
      case AIStates.thinking:
        orbEl.style.animation = 'nova-orb-thinking 1.2s ease-in-out infinite';
        break;
      case AIStates.processing:
        orbEl.style.animation = 'nova-orb-processing 2s linear infinite';
        break;
      case AIStates.success:
        orbEl.style.animation = 'nova-orb-success 0.6s ease-out';
        setTimeout(() => this.setState(AIStates.idle), 1000);
        break;
      case AIStates.error:
        orbEl.style.animation = 'nova-orb-error 0.4s ease-out';
        setTimeout(() => this.setState(AIStates.idle), 1500);
        break;
    }
  }

  /**
   * Process user input — local-first, no cloud by default
   */
  async process(input, options = {}) {
    if (!input || !input.trim()) return;
    
    const query = input.trim();
    this.addToHistory({ role: 'user', content: query, timestamp: Date.now() });
    
    this.setState(AIStates.thinking);
    
    // Simulate thinking delay
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    
    this.setState(AIStates.processing);
    
    // Local intent matching — no cloud
    const result = this.matchIntent(query);
    
    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    
    if (result) {
      // Check if needs confirmation for sensitive actions
      if (result.needsConfirm && !options.confirmed) {
        this.setState(AIStates.idle);
        return {
          type: 'confirm',
          message: `هل تريد تنفيذ: ${result.label}؟`,
          action: result,
          originalQuery: query,
        };
      }
      
      this.setState(AIStates.success);
      const response = this.generateResponse(result, query);
      this.addToHistory({ role: 'assistant', content: response, timestamp: Date.now(), action: result });
      
      return {
        type: 'success',
        message: response,
        action: result,
      };
    } else {
      this.setState(AIStates.error);
      const fallback = this.generateFallback(query);
      this.addToHistory({ role: 'assistant', content: fallback, timestamp: Date.now() });
      
      return {
        type: 'error',
        message: fallback,
      };
    }
  }

  matchIntent(query) {
    const q = query.toLowerCase();
    
    // Workspace intents
    if (q.includes('مساحة') || q.includes('workspace')) {
      if (q.includes('آخر') || q.includes('اخير') || q.includes('last')) {
        return { id: 'openWorkspace', label: 'افتح آخر مساحة', intent: 'openLastWorkspace' };
      }
      if (q.includes('جديد') || q.includes('انشئ') || q.includes('create')) {
        return { id: 'createSpace', label: 'أنشئ مساحة جديدة', intent: 'createSpace', needsConfirm: true };
      }
    }
    
    // Photo search
    if (q.includes('صورة') || q.includes('صور') || q.includes('photo')) {
      return { id: 'searchPhotos', label: 'ابحث عن الصور', intent: 'searchPhotos', query };
    }
    
    // App listing
    if (q.includes('تطبيق') && (q.includes('فتح') || q.includes('مفتوح') || q.includes('اليوم'))) {
      return { id: 'listApps', label: 'التطبيقات المفتوحة اليوم', intent: 'listApps' };
    }
    
    // Settings
    if (q.includes('إعداد') || q.includes('settings')) {
      return { id: 'openSettings', label: 'افتح الإعدادات', intent: 'openSettings' };
    }
    
    // Search
    if (q.includes('ابحث') || q.includes('search')) {
      return { id: 'search', label: `ابحث عن: ${query}`, intent: 'search', query };
    }
    
    // Help
    if (q.includes('مساعدة') || q.includes('help') || q.includes('ماذا تستطيع')) {
      return { id: 'help', label: 'المساعدة', intent: 'help' };
    }
    
    return null;
  }

  generateResponse(action, originalQuery) {
    switch (action.intent) {
      case 'openLastWorkspace':
        return 'فتحت آخر مساحة عمل لك. تحتوي على 3 تطبيقات.';
      case 'createSpace':
        return 'تم إنشاء مساحة جديدة. يمكنك إضافة التطبيقات إليها الآن.';
      case 'searchPhotos':
        return `بحثت عن الصور المتعلقة بـ "${originalQuery}". وجدت 12 صورة.`;
      case 'listApps':
        return 'التطبيقات التي فتحتها اليوم: واتساب، المعرض، الموسيقى، الإعدادات.';
      case 'openSettings':
        return 'فتحت الإعدادات. يمكنك تخصيص المظهر والحركة والزجاج من هنا.';
      case 'search':
        return `أبحث عن "${action.query}" في النظام...`;
      case 'help':
        return 'أستطيع مساعدتك في: فتح المساحات، البحث عن الصور والملفات، عرض التطبيقات، وإدارة الإعدادات. كل شيء محلي وآمن.';
      default:
        return `تم تنفيذ: ${action.label}`;
    }
  }

  generateFallback(query) {
    const fallbacks = [
      `لم أفهم "${query}" تماماً. جرب: "افتح آخر مساحة" أو "ابحث عن الصور".`,
      'أستطيع مساعدتك في إدارة المساحات والبحث والتطبيقات. ماذا تريد أن تفعل؟',
      `عذراً، لا أستطيع تنفيذ "${query}" حالياً. جرب صياغة أخرى.`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  addToHistory(entry) {
    this.history.push(entry);
    if (this.history.length > 50) {
      this.history = this.history.slice(-50);
    }
    this.saveHistory();
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
  }

  onStateChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Create AI surface UI with NOVA Orb
   */
  createSurface(container, options = {}) {
    const onAction = options.onAction || (() => {});
    
    const surface = document.createElement('div');
    surface.className = 'nova-ai';
    surface.innerHTML = `
      <div class="nova-ai__orb-container">
        <div class="nova-ai__orb" data-ai-state="idle">
          <div class="nova-ai__orb-core"></div>
          <div class="nova-ai__orb-glow"></div>
          <div class="nova-ai__orb-ring"></div>
          <div class="nova-ai__orb-inner-light"></div>
        </div>
        <div class="nova-ai__status">NOVA AI</div>
      </div>
      <div class="nova-ai__chat">
        <div class="nova-ai__messages"></div>
        <div class="nova-ai__input-area">
          <input type="text" class="nova-ai__input" placeholder="اكتب رسالة أو اطلب إجراء..." />
          <button class="nova-ai__send">إرسال</button>
          <button class="nova-ai__mic" title="تحدث">🎤</button>
        </div>
      </div>
      <div class="nova-ai__suggestions">
        <button data-suggest="افتح آخر مساحة">افتح آخر مساحة</button>
        <button data-suggest="ابحث عن الصور الخاصة بالرحلة">صور الرحلة</button>
        <button data-suggest="ما التطبيقات التي فتحتها اليوم؟">تطبيقات اليوم</button>
      </div>
    `;

    const orb = surface.querySelector('.nova-ai__orb');
    const messagesEl = surface.querySelector('.nova-ai__messages');
    const input = surface.querySelector('.nova-ai__input');
    const sendBtn = surface.querySelector('.nova-ai__send');
    const micBtn = surface.querySelector('.nova-ai__mic');
    
    this.orbElement = orb;

    const addMessage = (role, content, animate = true) => {
      const msgEl = document.createElement('div');
      msgEl.className = `nova-ai__message nova-ai__message--${role}`;
      
      if (role === 'assistant' && animate) {
        // Gradual text appearance but not exaggerated streaming
        msgEl.textContent = '';
        messagesEl.appendChild(msgEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        
        let index = 0;
        const interval = setInterval(() => {
          if (index < content.length) {
            msgEl.textContent = content.slice(0, index + 1);
            index++;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } else {
            clearInterval(interval);
          }
        }, 20);
      } else {
        msgEl.textContent = content;
        messagesEl.appendChild(msgEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      
      return msgEl;
    };

    // Render history
    for (const entry of this.history.slice(-10)) {
      addMessage(entry.role, entry.content, false);
    }

    const handleSubmit = async () => {
      const query = input.value.trim();
      if (!query) return;
      
      input.value = '';
      addMessage('user', query, false);
      
      const result = await this.process(query);
      
      if (result) {
        if (result.type === 'confirm') {
          const confirmEl = document.createElement('div');
          confirmEl.className = 'nova-ai__confirm';
          confirmEl.innerHTML = `
            <div class="nova-ai__confirm-text">${result.message}</div>
            <div class="nova-ai__confirm-actions">
              <button class="nova-ai__confirm-yes">تأكيد</button>
              <button class="nova-ai__confirm-no">إلغاء</button>
            </div>
          `;
          messagesEl.appendChild(confirmEl);
          
          confirmEl.querySelector('.nova-ai__confirm-yes').addEventListener('click', async () => {
            confirmEl.remove();
            const confirmedResult = await this.process(result.originalQuery, { confirmed: true });
            if (confirmedResult) {
              addMessage('assistant', confirmedResult.message);
              onAction(confirmedResult.action);
            }
          });
          
          confirmEl.querySelector('.nova-ai__confirm-no').addEventListener('click', () => {
            confirmEl.remove();
            addMessage('assistant', 'تم الإلغاء.');
          });
        } else {
          addMessage('assistant', result.message);
          if (result.action) {
            onAction(result.action);
          }
        }
      }
    };

    sendBtn.addEventListener('click', handleSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    });

    // Suggestions
    surface.querySelectorAll('[data-suggest]').forEach(btn => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.suggest;
        handleSubmit();
      });
    });

    // Mic — listening state
    let isListening = false;
    micBtn.addEventListener('click', () => {
      isListening = !isListening;
      if (isListening) {
        this.setState(AIStates.listening);
        micBtn.textContent = '⏹️';
        micBtn.classList.add('nova-ai__mic--listening');
        
        // Simulate voice input
        setTimeout(() => {
          isListening = false;
          micBtn.textContent = '🎤';
          micBtn.classList.remove('nova-ai__mic--listening');
          input.value = 'افتح آخر مساحة';
          handleSubmit();
        }, 2000);
      } else {
        this.setState(AIStates.idle);
        micBtn.textContent = '🎤';
        micBtn.classList.remove('nova-ai__mic--listening');
      }
    });

    container.appendChild(surface);

    return {
      element: surface,
      orb,
      destroy: () => {
        this.orbElement = null;
        surface.remove();
      },
    };
  }
}

export const aiEngine = new NovaAIEngine();
export default aiEngine;
