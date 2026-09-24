/* ══════════════════════════════════════════════════════════════
   NOVA SPACES — per spec #27-28, #58
   Workspace: Work, Travel, Study, Gaming, Personal
   Each Space contains: Apps, Files, People, Notes, Actions
   Depth Zoom + Parallax + Morph + Reveal, 300-500ms
   ══════════════════════════════════════════════════════════════ */

import NovaMotion from '../../motion/motion.js';

export const DefaultSpaces = [
  { id: 'work', name: 'العمل', icon: 'briefcase', color: '#6C5CE7', apps: [] },
  { id: 'personal', name: 'شخصي', icon: 'person', color: '#FF6B9A', apps: [] },
  { id: 'study', name: 'الدراسة', icon: 'book', color: '#4ADE80', apps: [] },
  { id: 'travel', name: 'السفر', icon: 'map', color: '#22D3EE', apps: [] },
  { id: 'gaming', name: 'الألعاب', icon: 'game', color: '#F5A524', apps: [] },
];

class NovaSpacesManager {
  constructor() {
    this.spaces = this.loadSpaces();
    this.currentSpace = this.spaces[0]?.id || 'work';
    this.listeners = new Set();
  }

  loadSpaces() {
    try {
      const saved = JSON.parse(localStorage.getItem('nova.spaces') || 'null');
      if (saved && Array.isArray(saved) && saved.length > 0) {
        return saved;
      }
    } catch {}
    return [...DefaultSpaces];
  }

  saveSpaces() {
    try {
      localStorage.setItem('nova.spaces', JSON.stringify(this.spaces));
    } catch {}
  }

  getSpaces() {
    return [...this.spaces];
  }

  getSpace(id) {
    return this.spaces.find(s => s.id === id);
  }

  getCurrentSpace() {
    return this.getSpace(this.currentSpace);
  }

  createSpace(name, options = {}) {
    const id = `space-${Date.now()}`;
    const space = {
      id,
      name,
      icon: options.icon || 'layers',
      color: options.color || '#6C5CE7',
      apps: [],
      files: [],
      people: [],
      notes: [],
      actions: [],
      created: Date.now(),
      ...options,
    };
    
    this.spaces.push(space);
    this.saveSpaces();
    this.notify('create', space);
    return space;
  }

  deleteSpace(id) {
    if (this.spaces.length <= 1) return false; // Keep at least one
    const index = this.spaces.findIndex(s => s.id === id);
    if (index === -1) return false;
    
    this.spaces.splice(index, 1);
    if (this.currentSpace === id) {
      this.currentSpace = this.spaces[0].id;
    }
    this.saveSpaces();
    this.notify('delete', { id });
    return true;
  }

  updateSpace(id, updates) {
    const space = this.getSpace(id);
    if (!space) return false;
    
    Object.assign(space, updates);
    this.saveSpaces();
    this.notify('update', space);
    return true;
  }

  switchSpace(id, options = {}) {
    const space = this.getSpace(id);
    if (!space) return false;
    
    const prev = this.currentSpace;
    this.currentSpace = id;
    
    try {
      localStorage.setItem('nova.currentSpace', id);
    } catch {}
    
    this.notify('switch', { from: prev, to: id, space });
    
    // Animation: Depth Zoom + Parallax + Morph + Reveal
    if (options.animate !== false) {
      this.animateSpaceTransition(prev, id, options);
    }
    
    return true;
  }

  animateSpaceTransition(fromId, toId, options = {}) {
    const duration = options.duration || 400;
    const velocity = options.velocity || 800;
    
    // This would be implemented in the surface layer
    // For now, emit event for surfaces to handle
    try {
      window.dispatchEvent(new CustomEvent('nova:space-transition', {
        detail: { from: fromId, to: toId, duration, velocity }
      }));
    } catch {}
  }

  addAppToSpace(spaceId, appId) {
    const space = this.getSpace(spaceId);
    if (!space) return false;
    
    if (!space.apps.includes(appId)) {
      space.apps.push(appId);
      this.saveSpaces();
      this.notify('appAdd', { spaceId, appId });
    }
    return true;
  }

  removeAppFromSpace(spaceId, appId) {
    const space = this.getSpace(spaceId);
    if (!space) return false;
    
    const index = space.apps.indexOf(appId);
    if (index !== -1) {
      space.apps.splice(index, 1);
      this.saveSpaces();
      this.notify('appRemove', { spaceId, appId });
    }
    return true;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(type, data) {
    for (const fn of this.listeners) {
      try { fn(type, data); } catch {}
    }
  }

  /**
   * Create Spaces surface UI
   */
  createSurface(container, options = {}) {
    const onSwitch = options.onSwitch || (() => {});
    const onCreate = options.onCreate || (() => {});
    
    const surface = document.createElement('div');
    surface.className = 'nova-spaces';
    surface.innerHTML = `
      <div class="nova-spaces__header">
        <h2 class="nova-spaces__title">المساحات</h2>
        <button class="nova-spaces__new">+ جديد</button>
      </div>
      <div class="nova-spaces__list"></div>
    `;
    
    const list = surface.querySelector('.nova-spaces__list');
    const newBtn = surface.querySelector('.nova-spaces__new');
    
    const render = () => {
      list.innerHTML = '';
      this.spaces.forEach((space, index) => {
        const el = document.createElement('button');
        el.className = `nova-spaces__item ${space.id === this.currentSpace ? 'nova-spaces__item--active' : ''}`;
        el.style.setProperty('--space-color', space.color);
        el.innerHTML = `
          <div class="nova-spaces__item-icon" style="background: ${space.color}">${space.icon}</div>
          <div class="nova-spaces__item-content">
            <div class="nova-spaces__item-name">${space.name}</div>
            <div class="nova-spaces__item-count">${space.apps.length} تطبيقات</div>
          </div>
          <div class="nova-spaces__item-arrow">›</div>
        `;
        
        el.style.opacity = '0';
        el.style.transform = 'translateY(12px)';
        
        el.addEventListener('click', () => {
          this.switchSpace(space.id, { velocity: 800 });
          onSwitch(space);
        });
        
        list.appendChild(el);
        
        // Staggered animation
        setTimeout(() => {
          NovaMotion.spring({
            from: 0, to: 1,
            springName: 'SOFT',
            onUpdate: (v) => {
              el.style.opacity = String(v);
              el.style.transform = `translateY(${(1 - v) * 12}px)`;
            },
          });
        }, index * 60);
      });
    };
    
    newBtn.addEventListener('click', () => {
      const name = prompt('اسم المساحة الجديدة:');
      if (name) {
        const space = this.createSpace(name);
        render();
        onCreate(space);
      }
    });
    
    render();
    
    const unsubscribe = this.onChange(() => render());
    
    container.appendChild(surface);
    
    return {
      element: surface,
      render,
      destroy: () => {
        unsubscribe();
        surface.remove();
      },
    };
  }
}

export const spacesManager = new NovaSpacesManager();
export default spacesManager;
