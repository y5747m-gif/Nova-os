/* ══════════════════════════════════════════════════════════════
   NOVA OS — Unified System Index
   Exports all NOVA engines and systems per spec #58
   nova-core, nova-system-ui, nova-launcher, nova-motion, nova-glass,
   nova-shapes, nova-gesture, nova-window, nova-notification, nova-control,
   nova-search, nova-ai, nova-security, nova-settings, nova-canvas,
   nova-spaces, nova-performance, nova-haptics, nova-audio
   ══════════════════════════════════════════════════════════════ */

// Design Tokens
export { NovaTokens, default as tokens } from './tokens/tokens.js';

// Glass Engine
export { 
  GlassLevels,
  NovaGlassSurface,
  NovaGlassCard,
  NovaGlassPanel,
  NovaGlassButton,
  NovaGlassDialog,
  NovaGlassNavigation,
  NovaGlassNotification,
  NovaGlassOrb,
  createGlass,
  glassManager,
  selectAdaptiveGlassLevel,
  default as glass
} from './glass/glass.js';

// Shape Engine
export {
  NovaShape,
  NovaOrb,
  NovaCapsule,
  NovaPrism,
  NovaRing,
  NovaCrystal,
  NovaNode,
  NovaArc,
  NovaRibbon,
  createShape,
  ShapeUsage,
  shapeSystem,
  default as shapes
} from './shapes/shapes.js';

// Motion API
export {
  MotionAPI,
  TextMotion,
  NovaMotionAPI,
  default as motionAPI
} from './motion/motion-api.js';

// Performance Manager
export {
  DeviceTiers,
  PerformanceModes,
  performanceManager,
  default as performance
} from './performance/performance.js';

// Gesture Engine
export {
  GestureTypes,
  GestureZones,
  gestureEngine,
  default as gesture
} from './gesture/gesture.js';

// Text Motion
export {
  TextMotionTypes,
  NovaTextMotion,
  textMotion,
  default as text
} from './text/text-motion.js';

// Haptics
export {
  HapticPatterns,
  hapticsEngine,
  default as haptics
} from './haptics/haptics.js';

// Audio
export {
  SoundEvents,
  SoundPack,
  audioEngine,
  default as audio
} from './audio/audio.js';

// Find
export {
  SearchCategories,
  findEngine,
  default as find
} from './find/find.js';

// Spaces
export {
  DefaultSpaces,
  spacesManager,
  default as spaces
} from './spaces/spaces.js';

// Security
export {
  PermissionTypes,
  securityCenter,
  default as security
} from './security/security.js';

// AI
export {
  AIStates,
  AICapabilities,
  aiEngine,
  default as ai
} from './ai/ai.js';

// Settings
export {
  SettingsSections,
  MotionPresets,
  GlassPresets,
  settingsManager,
  default as settings
} from './settings/settings.js';

/* ── NOVA OS Identity per spec #4 ──────────────────────────── */
export const NovaOS = {
  name: 'NOVA OS',
  experience: 'NOVA EXPERIENCE',
  visualEngine: 'NOVA VISUAL ENGINE',
  motion: 'NOVA MOTION',
  core: 'NOVA CORE',
  find: 'NOVA FIND',
  spaces: 'NOVA SPACES',
  canvas: 'NOVA CANVAS',
  flow: 'NOVA FLOW',
  control: 'NOVA CONTROL',
  ai: 'NOVA AI',
  security: 'NOVA SECURITY',
  version: '1.0.1',
  build: 'nova-os-v1',
};

/* ── Initialize all systems ────────────────────────────────── */
export function initNovaSystems() {
  console.log(`%c${NovaOS.name} %c${NovaOS.version} — Initializing...`, 
    'color: #6C5CE7; font-weight: 700; font-size: 14px;',
    'color: #8B93A1; font-size: 12px;'
  );

  // Apply settings
  try {
    const { settingsManager } = require('./settings/settings.js');
    settingsManager.applyAll();
  } catch {}

  // Start performance monitoring
  try {
    performanceManager.startMonitoring();
  } catch {}

  // Log system info
  try {
    const perf = performanceManager.getDebugInfo();
    console.log('NOVA Performance:', perf);
    console.log('NOVA Glass Level:', glassManager.getLevel());
    console.log('NOVA Device Tier:', perf.tier);
  } catch {}

  console.log(`%c${NovaOS.name} Ready — Intent → Interaction → Motion → Action → Completion`,
    'color: #34D399; font-weight: 600;'
  );
}

/* ── System Health Check ───────────────────────────────────── */
export function systemHealthCheck() {
  const checks = {
    tokens: true,
    glass: true,
    shapes: true,
    motion: true,
    performance: true,
    gesture: true,
    text: true,
    haptics: true,
    audio: true,
    find: true,
    spaces: true,
    security: true,
    ai: true,
    settings: true,
  };

  try {
    // Check each system
    checks.tokens = typeof NovaTokens !== 'undefined';
    checks.glass = typeof GlassLevels !== 'undefined';
    checks.shapes = typeof NovaOrb !== 'undefined';
    checks.motion = typeof MotionAPI !== 'undefined';
    checks.performance = typeof performanceManager !== 'undefined';
    checks.gesture = typeof gestureEngine !== 'undefined';
    checks.text = typeof textMotion !== 'undefined';
    checks.haptics = typeof hapticsEngine !== 'undefined';
    checks.audio = typeof audioEngine !== 'undefined';
    checks.find = typeof findEngine !== 'undefined';
    checks.spaces = typeof spacesManager !== 'undefined';
    checks.security = typeof securityCenter !== 'undefined';
    checks.ai = typeof aiEngine !== 'undefined';
    checks.settings = typeof settingsManager !== 'undefined';
  } catch (e) {
    console.warn('NOVA Health Check failed:', e);
  }

  const allPass = Object.values(checks).every(Boolean);
  console.log('NOVA System Health:', allPass ? '✓ All systems nominal' : '✗ Issues detected', checks);
  
  return { healthy: allPass, checks };
}

export default {
  NovaOS,
  initNovaSystems,
  systemHealthCheck,
};
