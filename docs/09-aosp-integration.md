# 09 — AOSP Integration Plan

> **ملخص عربي:** إزاي ننقل NOVA من بروتوتايب ويب + APK Launcher إلى Custom ROM مبني على AOSP.

## 1. Two Paths, One Experience (from 03-architecture)

| | Path A — Launcher (MVP, current) | Path B — ROM (NOVA OS proper) |
|---|---|---|
| Base | AOSP user build + privileged launcher | AOSP fork with NOVA platform services |
| Owns | Home, CORE, CANVAS, FLOW, CONTROL, FIND, gestures via role | SystemUI, WindowManager, Power menu, Permission UI, Boot, Settings |
| Ship time | Weeks | Quarters |

**Decision:** Experience layer as portable module set that compiles into both.

## 2. Module Mapping to AOSP

```
NOVA Module          → AOSP Location
─────────────────────────────────────────────────────────
nova-system-ui       → frameworks/base/packages/SystemUI
                      (StatusBar, NavigationBar, Keyguard)
nova-launcher        → packages/apps/NovaLauncher (privileged)
nova-motion          → frameworks/base/libs/nova-motion (Kotlin + C++)
                      Used by SystemUI, Launcher, Settings
nova-glass           → frameworks/base/graphics/java/android/graphics
                      NovaGlassEngine as RenderNode + blur via RenderEffect
nova-shapes          → frameworks/base/packages/SystemUI/src/os/nova/shapes
nova-gesture         → frameworks/base/services/core/java/com/android/server/wm
                      NovaGestureEngine + predictive back integration
nova-window          → frameworks/base/services/core/java/com/android/server/wm
                      NovaWindowManager: card/window/space lifecycle
nova-notification    → frameworks/base/packages/SystemUI/src/os/nova/flow
                      NOVA FLOW replaces NotificationShade
nova-control         → frameworks/base/packages/SystemUI/src/os/nova/control
nova-search          → frameworks/base/packages/SystemUI/src/os/nova/find
                      + GlobalSearch provider
nova-ai              → packages/apps/NovaAI (system app, local-first)
nova-security        → packages/apps/NovaSecurity + Settings
nova-settings        → packages/apps/Settings + NovaSettings provider
nova-canvas          → frameworks/base/packages/SystemUI/src/os/nova/canvas
                      Recents → 2D workspace
nova-spaces          → packages/apps/NovaLauncher + system service
nova-performance     → frameworks/base/services/core/java/com/android/server/nova
                      NovaPerformanceManager: thermal, battery, memory
nova-haptics         → frameworks/base/services/core/java/com/android/server
nova-audio           → frameworks/base/media + Nova sound set
nova-tokens          → frameworks/base/core/res/res/values/nova_tokens.xml
```

## 3. Build System

### AOSP Fork Structure

```
aosp/
├── build/
├── frameworks/
│   ├── base/
│   │   ├── libs/nova-motion/         ← Kotlin + C++ spring solver
│   │   ├── libs/nova-glass/          ← Glass rendering (RenderEffect + blur)
│   │   └── packages/SystemUI/
│   │       └── src/os/nova/          ← All NOVA surfaces
├── packages/
│   ├── apps/
│   │   ├── NovaLauncher/             ← Privileged launcher (Path A code)
│   │   ├── NovaAI/
│   │   ├── NovaSecurity/
│   │   └── Settings/                 ← Extended with NOVA sections
│   └── services/
│       └── Nova/                     ← System services
├── vendor/
│   └── nova/
│       ├── overlay/                  ← Themes, accent packs
│       ├── prebuilt/                 ← Sound set, icons
│       └── config/                   ← Device configs
└── device/
    └── nova/
        └── nova_phone/               ← Reference device
```

### Build Targets

```bash
# Reference device
lunch nova_phone-userdebug
m -j

# Emulator
lunch aosp_emulator-userdebug
m -j

# GMS variant (if needed)
lunch nova_phone_gms-userdebug
```

## 4. SystemUI Integration

### Replace Notification Shade with NOVA FLOW

```kotlin
// SystemUI/src/com/android/systemui/statusbar/phone/CentralSurfacesImpl.kt
// Replace with NOVA FLOW controller

class NovaFlowController @Inject constructor(
    private val motionEngine: NovaMotion,
    private val glassEngine: NovaGlassEngine,
    private val performanceManager: NovaPerformanceManager
) {
    // Orb → Card → Event per spec #29-30
}
```

### Replace Recents with NOVA CANVAS

```kotlin
// SystemUI/src/com/android/systemui/recents/RecentsImpl.kt
// Replace with NOVA CANVAS 2D workspace

class NovaCanvasController {
    // Cards with Depth, Shadow, Glass, Motion, Position
    // Drag to close, spatial memory
}
```

### NOVA CORE (Status + Navigation)

```kotlin
// SystemUI/src/com/android/systemui/statusbar/phone/
// StatusBar + NavigationBar → NOVA CORE orbital launchpad
```

## 5. WindowManager Integration

### NOVA Window Lifecycle

```kotlin
// frameworks/base/services/core/java/com/android/server/wm/NovaWindowManager.kt

class NovaWindowManagerService {
    // Card → Lift → Expand → Morph → Application
    // Application → Compress → Morph → Card
    // Shared element transitions via SurfaceControl
}
```

### Gesture Engine

```kotlin
// frameworks/base/services/core/java/com/android/server/wm/NovaGestureEngine.kt

class NovaGestureEngine {
    // Zones: bottom (CORE), top (FLOW), right (Back), corner (CONTROL)
    // Gesture-driven progress, velocity-based commit
    // Integrates with OnBackInvokedCallback + BackEvent
}
```

## 6. Performance Manager

### Real Thermal/Battery APIs

```kotlin
// frameworks/base/services/core/java/com/android/server/nova/NovaPerformanceManager.kt

class NovaPerformanceManagerService : SystemService {
    // Uses:
    // - PowerManager thermal listeners
    // - BatteryManager
    // - ActivityManager memory pressure
    // - HardwarePropertiesManager
    // - FrameMetrics for FPS
    
    fun onThermalStatusChanged(status: Int) {
        when (status) {
            PowerManager.THERMAL_STATUS_SEVERE -> setMode(Battery)
            PowerManager.THERMAL_STATUS_MODERATE -> setMode(Performance)
        }
    }
}
```

### Glass Downgrade

```kotlin
if (thermalState == ThermalState.Critical || memoryPressure > 0.85) {
    glassLevel = GlassLevel.Solid
    blur = 0
    particles = false
    background = false
}
```

## 7. Security Model

### Inherits AOSP Security

- Verified boot, dm-verity
- File-based encryption (Android Keystore)
- SELinux policies for NOVA services
- Permissions via PackageManager

### NOVA SECURITY CENTER

```kotlin
// packages/apps/NovaSecurity

class NovaSecurityCenter {
    // Audit log: camera/mic/location usage
    // Uses AppOpsManager for tracking
    // Privacy dashboard
}
```

### Permission UI

```kotlin
// Consequence language: "الآن فقط · أثناء الاستخدام · هذه المرة · لا تسمح"
// Always show why
```

## 8. Boot Experience

### Boot Animation

```
NOVA → Orb → Ring → Crystal → NOVA OS → Home
Short duration, no delay

Implementation:
- frameworks/base/cmds/bootanimation/BootAnimation.cpp
- Replace with NOVA boot: Orb → Ring → Crystal
- Or: vendor/nova/prebuilt/bootanimation.zip with NOVA assets
- Boot time target: < 15s to Home
```

### Early Boot

```kotlin
// frameworks/base/services/java/com/android/server/SystemServer.java
// Start NovaPerformanceManager early
// Start NovaSpacesManager
```

## 9. Sound Pack

### System Sounds

```
vendor/nova/prebuilt/sounds/
├── nova_open.ogg
├── nova_close.ogg
├── nova_success.ogg
├── nova_error.ogg
├── nova_tick.ogg
├── nova_charging.ogg
└── nova_unlock.ogg

Characteristics:
- Short (90-150ms)
- Quiet (0.25-0.35 volume)
- Clear (sine wave, not harsh)
- Not annoying
- Not similar to other OS
```

### Implementation

```kotlin
// frameworks/base/media/java/android/media/NovaSoundManager.kt

object NovaSound {
    fun play(event: SoundEvent) {
        // WebAudio equivalent on Android: SoundPool + synthesized tones
        // Or: pre-rendered OGG files via MediaPlayer
    }
}
```

## 10. Compatibility

- Minimum: Android 13 (predictive back + RenderEffect + shared elements)
- Target: latest AOSP, Pixel first, then Snapdragon 8-series
- No custom kernel, no root
- Maintainability: track AOSP releases quarterly

## 11. GMS / Compatibility

- NOVA OS changes Experience, SystemUI, Navigation, Windows, Notifications, Settings
- Does NOT break Android App Compatibility
- GMS: if needed, separate gms variant with GApps
- CTS: must pass for GMS

## 12. Migration Steps

### Step 1: Validate Prototype (Done)
- Web prototype with NOVA MOTION
- APK Launcher
- All surfaces working

### Step 2: Kotlin Port (In Progress)
- Motion engine Kotlin twin (done, golden curves)
- Glass, Shapes, Performance, Gesture, etc. Kotlin modules (done)
- Compose SystemUI surfaces

### Step 3: SystemUI Fork
- Fork SystemUI
- Replace NotificationShade with FLOW
- Replace Recents with CANVAS
- Implement CORE, CONTROL, FIND

### Step 4: Framework Integration
- WindowManager morph transitions
- Gesture engine with BackEvent
- Performance manager with real APIs

### Step 5: AOSP ROM
- Full AOSP fork
- Build for reference device
- Boot animation, sounds, themes

### Step 6: Device
- Pixel-class device
- No custom kernel
- OTA updates via AOSP update_engine

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AOSP tracking overhead | Quarterly merges, automated tests |
| OEM gesture conflicts | Use platform BackEvent where available |
| Blur performance | Gate to 2 layers, 12px max, adaptive downgrade |
| Battery impact | Living background stops on battery saver, thermal, screen off |
| App compat | Don't break Activity lifecycle, use SurfaceControl for transitions |

## 14. Testing for ROM

- CTS, GTS (if GMS), VTS
- NOVA golden flows (12 scenarios)
- Performance: FPS, jank, thermal, battery
- Security: permission audit, encryption
