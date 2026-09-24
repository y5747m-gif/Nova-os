/* ══════════════════════════════════════════════════════════════
   NOVA FIND — Search system per spec #35-36
   Not just search bar: Glass Orb → Search Surface
   Search: Apps, Files, Contacts, Photos, Messages, Settings, Spaces, Actions
   Results: Relevant → Secondary → Other with smooth transitions
   ══════════════════════════════════════════════════════════════ */

import { APPS, appMeta } from '../../core/store.js';
import NovaMotion from '../../motion/motion.js';

export const SearchCategories = {
  apps: { id: 'apps', label: 'التطبيقات', icon: 'apps', priority: 1 },
  files: { id: 'files', label: 'الملفات', icon: 'folder', priority: 2 },
  contacts: { id: 'contacts', label: 'جهات الاتصال', icon: 'person', priority: 2 },
  photos: { id: 'photos', label: 'الصور', icon: 'image', priority: 3 },
  messages: { id: 'messages', label: 'الرسائل', icon: 'message', priority: 2 },
  settings: { id: 'settings', label: 'الإعدادات', icon: 'settings', priority: 3 },
  spaces: { id: 'spaces', label: 'المساحات', icon: 'layers', priority: 3 },
  actions: { id: 'actions', label: 'الإجراءات', icon: 'bolt', priority: 1 },
};

class NovaFindEngine {
  constructor() {
    this.index = new Map();
    this.history = [];
    this.maxHistory = 20;
    this.buildIndex();
  }

  buildIndex() {
    // Index apps
    for (const [id, app] of Object.entries(APPS)) {
      this.index.set(id, {
        id,
        type: 'apps',
        title: app.name,
        subtitle: app.sub || '',
        icon: app.icon,
        color: app.color,
        keywords: [app.name, app.sub, id].join(' ').toLowerCase(),
        priority: 1,
        action: () => ({ type: 'openApp', appId: id }),
      });
    }

    // Index settings
    const settingsItems = [
      { id: 'appearance', title: 'المظهر', subtitle: 'الوضع الداكن والفاتح', keywords: 'مظهر dark light' },
      { id: 'motion', title: 'الحركة', subtitle: 'ملف الحركة والسرعة', keywords: 'حركة motion' },
      { id: 'glass', title: 'الزجاج', subtitle: 'مستوى الشفافية والتمويه', keywords: 'زجاج glass blur' },
      { id: 'sound', title: 'الصوت', subtitle: 'أصوات النظام', keywords: 'صوت sound' },
      { id: 'haptics', title: 'الاهتزاز', subtitle: 'ردود الفعل اللمسية', keywords: 'اهتزاز haptics' },
      { id: 'gestures', title: 'الإيماءات', subtitle: 'التحكم بالإيماءات', keywords: 'إيماءات gestures' },
      { id: 'notifications', title: 'الإشعارات', subtitle: 'NOVA FLOW', keywords: 'إشعارات notifications flow' },
      { id: 'privacy', title: 'الخصوصية', subtitle: 'الأمان والخصوصية', keywords: 'خصوصية privacy security' },
      { id: 'battery', title: 'البطارية', subtitle: 'إدارة الطاقة', keywords: 'بطارية battery' },
      { id: 'performance', title: 'الأداء', subtitle: 'وضع الأداء', keywords: 'أداء performance' },
    ];

    for (const item of settingsItems) {
      this.index.set(`settings-${item.id}`, {
        id: `settings-${item.id}`,
        type: 'settings',
        title: item.title,
        subtitle: item.subtitle,
        icon: 'settings',
        keywords: `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase(),
        priority: 3,
        action: () => ({ type: 'openSettings', section: item.id }),
      });
    }

    // Index actions
    const actions = [
      { id: 'new-event', title: 'حدث جديد', keywords: 'حدث event new' },
      { id: 'new-space', title: 'مساحة جديدة', keywords: 'مساحة space new' },
      { id: 'clear-canvas', title: 'تفريغ المساحة', keywords: 'تفريغ clear canvas' },
      { id: 'toggle-dnd', title: 'عدم الإزعاج', keywords: 'إزعاج dnd quiet' },
      { id: 'lock', title: 'قفل الشاشة', keywords: 'قفل lock' },
      { id: 'screenshot', title: 'لقطة شاشة', keywords: 'لقطة screenshot' },
    ];

    for (const action of actions) {
      this.index.set(`action-${action.id}`, {
        id: `action-${action.id}`,
        type: 'actions',
        title: action.title,
        subtitle: 'إجراء سريع',
        icon: 'bolt',
        keywords: `${action.title} ${action.keywords}`.toLowerCase(),
        priority: 1,
        action: () => ({ type: 'action', actionId: action.id }),
      });
    }

    // Index spaces (workspaces)
    try {
      const spaces = JSON.parse(localStorage.getItem('nova.spaces') || '[]');
      for (const space of spaces) {
        this.index.set(`space-${space.id}`, {
          id: `space-${space.id}`,
          type: 'spaces',
          title: space.name,
          subtitle: `${space.apps?.length || 0} تطبيقات`,
          icon: 'layers',
          keywords: space.name.toLowerCase(),
          priority: 2,
          action: () => ({ type: 'openSpace', spaceId: space.id }),
        });
      }
    } catch {}
  }

  /**
   * Search with ranking: Relevant → Secondary → Other
   */
  search(query, options = {}) {
    if (!query || !query.trim()) {
      return {
        relevant: this.getRecentSearches().slice(0, 3),
        secondary: [],
        other: [],
        all: [],
      };
    }

    const q = query.toLowerCase().trim();
    const results = [];

    for (const item of this.index.values()) {
      let score = 0;
      
      // Exact match
      if (item.title.toLowerCase() === q) score += 100;
      else if (item.title.toLowerCase().startsWith(q)) score += 80;
      else if (item.title.toLowerCase().includes(q)) score += 60;
      
      // Keyword match
      if (item.keywords.includes(q)) score += 40;
      
      // Partial keyword match
      const queryWords = q.split(/\s+/);
      const keywordWords = item.keywords.split(/\s+/);
      for (const qw of queryWords) {
        for (const kw of keywordWords) {
          if (kw.startsWith(qw)) score += 10;
          else if (kw.includes(qw)) score += 5;
        }
      }

      // Boost by priority and type
      score += (5 - item.priority) * 2;
      
      // History boost
      if (this.history.includes(item.id)) score += 15;

      if (score > 0) {
        results.push({ ...item, score });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Categorize: Relevant (score >= 60), Secondary (30-59), Other (<30)
    const relevant = results.filter(r => r.score >= 60).slice(0, 5);
    const secondary = results.filter(r => r.score >= 30 && r.score < 60).slice(0, 5);
    const other = results.filter(r => r.score < 30).slice(0, 8);

    return {
      relevant,
      secondary,
      other,
      all: results,
    };
  }

  addToHistory(itemId) {
    this.history = [itemId, ...this.history.filter(id => id !== itemId)].slice(0, this.maxHistory);
    try {
      localStorage.setItem('nova.find.history', JSON.stringify(this.history));
    } catch {}
  }

  getRecentSearches() {
    try {
      const saved = JSON.parse(localStorage.getItem('nova.find.history') || '[]');
      this.history = saved;
      return saved.map(id => this.index.get(id)).filter(Boolean).slice(0, 5);
    } catch {
      return [];
    }
  }

  /**
   * Create FIND surface UI
   */
  createSurface(container, options = {}) {
    const onSelect = options.onSelect || (() => {});
    
    const surface = document.createElement('div');
    surface.className = 'nova-find';
    surface.innerHTML = `
      <div class="nova-find__orb">
        <div class="nova-find__orb-core"></div>
        <div class="nova-find__orb-glow"></div>
      </div>
      <div class="nova-find__surface">
        <div class="nova-find__search">
          <span class="nova-find__search-icon">◉</span>
          <input type="text" placeholder="ابحث عن التطبيقات، الملفات، الأشخاص..." class="nova-find__input" />
          <button class="nova-find__clear">✕</button>
        </div>
        <div class="nova-find__results">
          <div class="nova-find__section" data-section="relevant">
            <div class="nova-find__section-title">الأكثر صلة</div>
            <div class="nova-find__list" data-list="relevant"></div>
          </div>
          <div class="nova-find__section" data-section="secondary">
            <div class="nova-find__section-title">ثانوي</div>
            <div class="nova-find__list" data-list="secondary"></div>
          </div>
          <div class="nova-find__section" data-section="other">
            <div class="nova-find__section-title">أخرى</div>
            <div class="nova-find__list" data-list="other"></div>
          </div>
        </div>
      </div>
    `;

    const input = surface.querySelector('.nova-find__input');
    const clearBtn = surface.querySelector('.nova-find__clear');
    const orb = surface.querySelector('.nova-find__orb');
    const searchSurface = surface.querySelector('.nova-find__surface');

    // Orb → Search Surface animation
    setTimeout(() => {
      orb.style.transform = 'scale(0.3) translateY(-100px)';
      orb.style.opacity = '0';
      searchSurface.style.transform = 'scale(1)';
      searchSurface.style.opacity = '1';
    }, 100);

    // Search logic
    let searchTimeout;
    const performSearch = (query) => {
      const results = this.search(query);
      
      // Render with staggered animation
      this.renderResults(surface, results, onSelect);
    };

    input.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value;
      
      // Text animation
      if (query.length === 1) {
        input.style.transform = 'scale(1.02)';
        setTimeout(() => { input.style.transform = ''; }, 150);
      }
      
      searchTimeout = setTimeout(() => {
        performSearch(query);
      }, 150);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      performSearch('');
      input.focus();
    });

    // Initial render
    performSearch('');

    container.appendChild(surface);
    
    // Focus input
    setTimeout(() => input.focus(), 300);

    return {
      element: surface,
      input,
      search: performSearch,
      destroy: () => surface.remove(),
    };
  }

  renderResults(container, results, onSelect) {
    const renderList = (listName, items) => {
      const listEl = container.querySelector(`[data-list="${listName}"]`);
      const sectionEl = container.querySelector(`[data-section="${listName}"]`);
      
      if (!items.length) {
        sectionEl.style.display = 'none';
        return;
      }
      
      sectionEl.style.display = 'block';
      listEl.innerHTML = '';
      
      items.forEach((item, index) => {
        const el = document.createElement('button');
        el.className = 'nova-find__item';
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        el.innerHTML = `
          <div class="nova-find__item-icon" style="color: ${item.color || 'var(--nv-accent)'}">
            ${item.icon || '◉'}
          </div>
          <div class="nova-find__item-content">
            <div class="nova-find__item-title">${item.title}</div>
            <div class="nova-find__item-subtitle">${item.subtitle}</div>
          </div>
          <div class="nova-find__item-type">${SearchCategories[item.type]?.label || item.type}</div>
        `;
        
        el.addEventListener('click', () => {
          this.addToHistory(item.id);
          onSelect(item);
        });
        
        listEl.appendChild(el);
        
        // Staggered appearance
        setTimeout(() => {
          NovaMotion.spring({
            from: 0, to: 1,
            springName: 'SOFT',
            onUpdate: (v) => {
              el.style.opacity = String(v);
              el.style.transform = `translateY(${(1 - v) * 8}px)`;
            },
          });
        }, index * 40);
      });
    };

    renderList('relevant', results.relevant);
    renderList('secondary', results.secondary);
    renderList('other', results.other);
  }
}

export const findEngine = new NovaFindEngine();
export default findEngine;
