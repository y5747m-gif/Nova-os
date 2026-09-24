# 10 — Testing Strategy

> **ملخص عربي:** كل أنواع الاختبارات — وحدة، واجهة، إيماءات، أداء، ذاكرة، حركة، وصول، بطارية، حرارة.

## 1. Test Pyramid

```
E2E Golden Flows (12 scenarios) — jsdom + real device lab
├── UI Tests (Compose + Espresso)
├── Gesture Tests (velocity, progress, zones)
├── Performance Tests (FPS, jank, thermal)
├── Memory Tests (leaks, pressure)
├── Animation Tests (spring settle, overshoot budget)
├── Accessibility Tests (TalkBack, large text, high contrast)
├── Battery Tests (drain, background)
└── Unit Tests (springs, tokens, glass, shapes, performance)
```

## 2. Unit Tests

### Motion Engine (done)

```bash
# JS
npm run check:springs  # 109 physics assertions

# Kotlin
gradle testDebugUnitTest  # NovaMotionGoldenTest + SpringTest
# Replays golden-curves.json sample-for-sample
# Profiles × themes, release velocity budget, mid-flight re-targeting
```

### Tokens

```kotlin
@Test fun `tokens match spec`() {
    assertEquals("#06070A", NovaColors.Dark.bg)
    assertEquals("#0E1117", NovaColors.Dark.surface)
    assertEquals("#F4F6FA", NovaColors.Dark.text)
    assertEquals("#F4F6F8", NovaColors.Light.bg)
}

@Test fun `glass levels have correct blur`() {
    assertEquals(8, GlassLevels.clear.blur)
    assertEquals(14, GlassLevels.soft.blur)
    assertEquals(4, GlassLevels.solid.blur)
    assertEquals(22, GlassLevels.ultra.blur)
}

@Test fun `shape usage mapping`() {
    assertEquals("orb", ShapeUsage.wifi)
    assertEquals("ring", ShapeUsage.battery)
    assertEquals("node", ShapeUsage.notifications)
}
```

### Performance Manager

```kotlin
@Test fun `adaptive glass selection`() {
    assertEquals("solid", selectAdaptive("low", "balanced", "nominal", 0f, 60))
    assertEquals("ultra", selectAdaptive("high", "balanced", "nominal", 0f, 60))
    assertEquals("solid", selectAdaptive("high", "battery", "nominal", 0f, 60))
    assertEquals("solid", selectAdaptive("high", "balanced", "critical", 0f, 60))
}
```

## 3. UI Tests

### Compose

```kotlin
@Test fun `home shows greeting`() {
    composeRule.onNodeWithText("صباح الخير").assertExists()
}

@Test fun `find shows orb then search`() {
    composeRule.onNodeWithTag("findOrb").assertExists()
    // After 100ms, search surface appears
}

@Test fun `ai orb states`() {
    composeRule.onNodeWithTag("aiOrb").assertExists()
    // Test state transitions: idle → listening → thinking → success
}
```

### Web (jsdom) — existing

```bash
npm run check:experience  # 134 assertions
# Covers: unlock, morph, interactive back, CORE, FLOW, orb, canvas,
# drag & drop, split flow, sweep, install sheet, config matrix,
# version/manifest, desktop shell, dock, help overlay, keyboard parity,
# DND, sound, reduce-motion, notes/tasks persistence, calculator, terminal,
# wheel zoom, window close/maximize, card long-press pinning
```

## 4. Gesture Tests

```kotlin
@Test fun `back gesture progress`() {
    val engine = NovaGestureEngine()
    val zone = engine.getZone(width - 5f, height / 2, width, height)
    assertEquals(GestureZone.Right, zone)
    
    val progress = engine.calculateProgress(zone, -100f, 0f, width, height)
    assertTrue(progress > 0.2f)
}

@Test fun `bottom swipe opens CORE`() {
    val zone = engine.getZone(width / 2, height - 5f, width, height)
    assertEquals(GestureZone.Bottom, zone)
}

@Test fun `velocity cap`() {
    // Release velocity capped to 6% overshoot budget
    val capped = capReleaseVelocity(from=0.0, to=1.0, cfg, velocity=5000.0)
    assertTrue(capped < 1000) // capped, not raw
}
```

## 5. Performance Tests

### FPS & Jank

```kotlin
@Test fun `open transition no jank`() {
    val frameTimes = mutableListOf<Long>()
    // Record frame times during morph
    // Assert: 0 dropped at 120Hz, <2 at 60Hz
    assertTrue(frameTimes.count { it > 16.6 } < 2)
}

@Test fun `blur gated to 2 layers`() {
    // Create 3 glass surfaces with blur
    // Assert: only 2 have backdrop-filter
}
```

### Memory

```kotlin
@Test fun `no memory leak on app open close`() {
    val initial = getMemoryUsage()
    repeat(20) {
        openApp("gallery")
        closeApp()
    }
    System.gc()
    val final = getMemoryUsage()
    assertTrue(final - initial < 10 * 1024 * 1024) // <10MB growth
}

@Test fun `image loading bounded`() {
    // Load many images
    // Assert: cache size controlled, no OOM
}
```

### Thermal & Battery

```kotlin
@Test fun `thermal downgrade`() {
    val manager = NovaPerformanceManager()
    manager.updateFps(25) // low FPS → thermal serious
    assertEquals(PerformanceMode.Performance, manager.getState().mode)
    
    repeat(6) { manager.updateFps(20) }
    assertEquals(PerformanceMode.Battery, manager.getState().mode)
}

@Test fun `battery saver stops background`() {
    val manager = NovaPerformanceManager()
    manager.setBatterySaver(true)
    assertFalse(manager.shouldUseBackground())
    assertFalse(manager.shouldUseParticles())
    assertEquals(0, manager.getConfig().blur)
}
```

## 6. Animation Tests

```kotlin
@Test fun `spring settles`() {
    val anim = SpringAnimation(from=0.0, to=1.0, config=Springs.SOFT)
    var steps = 0
    while (!anim.done && steps < 1000) {
        anim.advance(0.016) // 60fps
        steps++
    }
    assertTrue(anim.done)
    assertTrue(steps < 200) // settles in time
}

@Test fun `overshoot budget 6%`() {
    for (profile in Profiles.values) {
        for (theme in Themes.values) {
            val cfg = springConfig(theme.spring)
            val overshoot = overshootOf(cfg)
            assertTrue(overshoot <= 0.065, "${profile.id} × ${theme.id} overshoot $overshoot > 6.5%")
        }
    }
}

@Test fun `reduced motion is critically damped`() {
    val cfg = springConfig("reduced")
    val ratio = dampingRatio(cfg)
    assertTrue(ratio >= 1.0) // critically damped, no overshoot
}
```

## 7. Accessibility Tests

```kotlin
@Test fun `reduce transparency converts glass to solid`() {
    val settings = NovaSettingsManager()
    settings.set("accessibility", "reduceTransparency", true)
    // Assert: glass level = solid, no blur
}

@Test fun `large text scales`() {
    // Set large text
    // Assert: font sizes scaled, no clipping
}

@Test fun `talkback navigates`() {
    // Enable TalkBack
    // Assert: all interactive elements have contentDescription
    // Assert: focus order logical
}
```

## 8. Security Tests

```kotlin
@Test fun `sensitive actions need confirmation`() {
    val ai = NovaAIEngine()
    val action = ai.matchIntent("احذف ملف مهم")
    assertTrue(action?.needsConfirm == true)
    
    val result = ai.process("احذف ملف مهم", confirmed=false)
    assertEquals("confirm", result["type"])
}

@Test fun `audit log tracks`() {
    val security = NovaSecurityCenter()
    security.logAccess("camera", "com.example.app")
    assertEquals(1, security.getAuditLog().size)
    assertEquals("camera", security.getAuditLog().first().permissionId)
}
```

## 9. E2E Golden Flows (12 scenarios)

Per docs/01, docs/02 — same as deck actions:

1. **Unlock**: Lock → swipe up → Home, clock animates
2. **Open app**: Card → Lift → Expand → Morph → App, shared element
3. **Back**: Edge swipe, progress-driven, velocity commit
4. **CORE**: Bottom swipe, orbital launchpad, search, apps
5. **FLOW**: Top swipe, event cards, actions
6. **CONTROL**: Corner, radial controls, follow finger
7. **CANVAS**: Open apps in 2D, drag, sweep to close
8. **Split**: Drag app from CORE onto another, divider with snap points
9. **FIND**: Orb → Search Surface, Relevant → Secondary → Other
10. **AI**: Orb states, local intent, confirmation
11. **Settings**: Wallpaper, appearance, motion, glass persistence
12. **DND**: Quiet events, no orb during media, persistence

Each flow asserts:
- No frame drops (or <2 at 60Hz)
- No memory leak
- Correct final state
- Reversible mid-flight
- Respects reduced motion

## 10. Debug Overlay (dev only)

Per spec #70 — shows for developer, not end user:

```
FPS
GPU load
CPU
Memory
Jank
Thermal state
Glass level
Performance mode
Device tier
```

Implementation:

```kotlin
@Composable
fun NovaDebugOverlay() {
    if (!BuildConfig.DEBUG) return
    if (!settings.developerMode) return
    
    val perf = performanceManager.getDebugInfo()
    Text("FPS: ${perf.fps} | Glass: ${perf.glass} | Thermal: ${perf.thermal}")
}
```

## 11. CI Gates

```yaml
# .github/workflows/pages.yml
- npm run check:motion
- npm run check:classes
- npm run check:springs
- npm run check:port
- npm run check:experience
- npm run check:deploy

# .github/workflows/apk.yml
- gradle testDebugUnitTest  # Must pass before APK build
- APK inspection
- Release to apk-latest
```

## 12. Device Lab

- Pixel-class reference device
- Low-end device (2GB RAM, 4 cores)
- Foldable (fold/unfold/half-open)
- Tablet
- Test matrix: Dark/Light × Accent packs × Motion profiles × Performance modes × Glass levels

## 13. Manual Checklist (docs/07-launcher-stability)

- Set as default launcher
- Back button behavior
- Widgets
- Notifications
- Deep links
- Rotation
- Fold/unfold
- Battery saver
- Thermal throttling simulation
- Accessibility: TalkBack, large text, high contrast, reduce transparency, reduced motion
