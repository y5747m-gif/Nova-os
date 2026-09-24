/* ══════════════════════════════════════════════════════════════
   NOVA SECURITY CENTER — per spec #57, #58
   Permissions, Privacy, Encryption status, App access,
   Camera, Microphone, Location, Notification access
   ══════════════════════════════════════════════════════════════ */

export const PermissionTypes = {
  camera: { id: 'camera', label: 'الكاميرا', icon: 'camera', sensitive: true },
  microphone: { id: 'microphone', label: 'الميكروفون', icon: 'mic', sensitive: true },
  location: { id: 'location', label: 'الموقع', icon: 'location', sensitive: true },
  contacts: { id: 'contacts', label: 'جهات الاتصال', icon: 'person', sensitive: true },
  storage: { id: 'storage', label: 'التخزين', icon: 'folder', sensitive: false },
  notifications: { id: 'notifications', label: 'الإشعارات', icon: 'bell', sensitive: false },
  phone: { id: 'phone', label: 'الهاتف', icon: 'phone', sensitive: true },
};

class NovaSecurityCenter {
  constructor() {
    this.permissions = new Map();
    this.auditLog = [];
    this.encryptionStatus = { enabled: true, type: 'file-based' };
    this.init();
  }

  init() {
    try {
      const saved = JSON.parse(localStorage.getItem('nova.security.audit') || '[]');
      this.auditLog = saved.slice(-100); // Keep last 100
    } catch {}
    
    // Check current permissions if available
    this.checkPermissions();
  }

  checkPermissions() {
    // In real Android, this would check actual permissions
    // For prototype, simulate
    for (const [key, perm] of Object.entries(PermissionTypes)) {
      this.permissions.set(key, {
        ...perm,
        granted: Math.random() > 0.3,
        lastUsed: Date.now() - Math.random() * 86400000 * 7,
        usageCount: Math.floor(Math.random() * 50),
      });
    }
  }

  getPermissions() {
    return Array.from(this.permissions.values());
  }

  getPermission(id) {
    return this.permissions.get(id);
  }

  getSensitivePermissions() {
    return this.getPermissions().filter(p => p.sensitive);
  }

  getAuditLog(limit = 20) {
    return this.auditLog.slice(-limit).reverse();
  }

  logAccess(permissionId, appId, action = 'access') {
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      permissionId,
      appId,
      action,
      timestamp: Date.now(),
    };
    
    this.auditLog.push(entry);
    if (this.auditLog.length > 100) {
      this.auditLog = this.auditLog.slice(-100);
    }
    
    try {
      localStorage.setItem('nova.security.audit', JSON.stringify(this.auditLog));
    } catch {}
    
    // Notify
    try {
      window.dispatchEvent(new CustomEvent('nova:security-log', { detail: entry }));
    } catch {}
  }

  getEncryptionStatus() {
    return { ...this.encryptionStatus };
  }

  getPrivacySummary() {
    const perms = this.getPermissions();
    const granted = perms.filter(p => p.granted).length;
    const sensitiveGranted = perms.filter(p => p.sensitive && p.granted).length;
    
    return {
      total: perms.length,
      granted,
      sensitiveGranted,
      auditCount: this.auditLog.length,
      encryption: this.encryptionStatus.enabled,
      riskLevel: sensitiveGranted > 3 ? 'high' : sensitiveGranted > 1 ? 'medium' : 'low',
    };
  }

  /**
   * Create Security Center UI
   */
  createSurface(container, options = {}) {
    const surface = document.createElement('div');
    surface.className = 'nova-security';
    surface.innerHTML = `
      <div class="nova-security__header">
        <h2 class="nova-security__title">الأمان والخصوصية</h2>
        <div class="nova-security__summary"></div>
      </div>
      <div class="nova-security__sections">
        <div class="nova-security__section" data-section="permissions">
          <h3 class="nova-security__section-title">الأذونات</h3>
          <div class="nova-security__list" data-list="permissions"></div>
        </div>
        <div class="nova-security__section" data-section="audit">
          <h3 class="nova-security__section-title">سجل الاستخدام</h3>
          <div class="nova-security__list" data-list="audit"></div>
        </div>
        <div class="nova-security__section" data-section="encryption">
          <h3 class="nova-security__section-title">التشفير</h3>
          <div class="nova-security__encryption"></div>
        </div>
      </div>
    `;

    const summaryEl = surface.querySelector('.nova-security__summary');
    const permList = surface.querySelector('[data-list="permissions"]');
    const auditList = surface.querySelector('[data-list="audit"]');
    const encryptionEl = surface.querySelector('.nova-security__encryption');

    const renderSummary = () => {
      const summary = this.getPrivacySummary();
      summaryEl.innerHTML = `
        <div class="nova-security__risk nova-security__risk--${summary.riskLevel}">
          <span class="nova-security__risk-label">مستوى الخطر:</span>
          <span class="nova-security__risk-value">${summary.riskLevel === 'high' ? 'عالي' : summary.riskLevel === 'medium' ? 'متوسط' : 'منخفض'}</span>
        </div>
        <div class="nova-security__stats">
          <span>${summary.granted}/${summary.total} إذن ممنوح</span>
          <span>${summary.sensitiveGranted} حساس</span>
          <span>${summary.encryption ? '🔒 مشفر' : '🔓 غير مشفر'}</span>
        </div>
      `;
    };

    const renderPermissions = () => {
      permList.innerHTML = '';
      for (const perm of this.getPermissions()) {
        const el = document.createElement('div');
        el.className = `nova-security__perm ${perm.granted ? 'nova-security__perm--granted' : ''} ${perm.sensitive ? 'nova-security__perm--sensitive' : ''}`;
        el.innerHTML = `
          <div class="nova-security__perm-icon">${perm.icon}</div>
          <div class="nova-security__perm-content">
            <div class="nova-security__perm-name">${perm.label}</div>
            <div class="nova-security__perm-meta">
              ${perm.granted ? `مستخدم ${perm.usageCount} مرة` : 'غير ممنوح'}
              ${perm.sensitive ? ' • حساس' : ''}
            </div>
          </div>
          <div class="nova-security__perm-status">${perm.granted ? '✓' : '✕'}</div>
        `;
        permList.appendChild(el);
      }
    };

    const renderAudit = () => {
      auditList.innerHTML = '';
      const logs = this.getAuditLog(10);
      if (!logs.length) {
        auditList.innerHTML = '<div class="nova-security__empty">لا يوجد سجل بعد</div>';
        return;
      }
      
      for (const log of logs) {
        const el = document.createElement('div');
        el.className = 'nova-security__audit';
        const perm = this.getPermission(log.permissionId);
        const time = new Date(log.timestamp).toLocaleString('ar');
        el.innerHTML = `
          <div class="nova-security__audit-icon">${perm?.icon || '•'}</div>
          <div class="nova-security__audit-content">
            <div class="nova-security__audit-app">${log.appId}</div>
            <div class="nova-security__audit-action">استخدم ${perm?.label || log.permissionId}</div>
          </div>
          <div class="nova-security__audit-time">${time}</div>
        `;
        auditList.appendChild(el);
      }
    };

    const renderEncryption = () => {
      const status = this.getEncryptionStatus();
      encryptionEl.innerHTML = `
        <div class="nova-security__enc-status">
          <div class="nova-security__enc-icon">${status.enabled ? '🔒' : '🔓'}</div>
          <div class="nova-security__enc-content">
            <div class="nova-security__enc-title">${status.enabled ? 'التشفير مفعّل' : 'التشفير معطل'}</div>
            <div class="nova-security__enc-desc">نوع التشفير: ${status.type}</div>
          </div>
        </div>
      `;
    };

    renderSummary();
    renderPermissions();
    renderAudit();
    renderEncryption();

    container.appendChild(surface);

    return {
      element: surface,
      destroy: () => surface.remove(),
    };
  }
}

export const securityCenter = new NovaSecurityCenter();
export default securityCenter;
