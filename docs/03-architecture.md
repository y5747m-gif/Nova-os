# 03 — Architecture

> **ملخص عربي:** في طريقتين: (1) نبني فوق Android كـ Launcher + System UI تجربة — مناسبة للـMVP،
> (2) نبني ROM من AOSP ونعيد بناء كل طبقات التجربة. المستند ده بيحدد الطبقات، مسؤوليات كل
> موديول، إزاي NOVA MOTION يتحوّل لـ Kotlin/Compose، وإزاي نتعامل مع الأمان والأذونات.

## 1. Two paths, one experience layer

| | Path A — Launcher / System Experience (MVP) | Path B — Custom ROM (NOVA OS proper) |
| --- | --- | --- |
| Base | AOSP user build + privileged launcher | AOSP fork with NOVA platform services |
| Owns | Home, CORE launcher, recents (CANVAS), gestures via accessibility/role, notification presentation, widgets, motion inside our surfaces | SystemUI, framework integrations, window management, power menu, permission UI, boot experience, settings |
| Can't own | Real system window management, lock screen internals, system-level DnD across arbitrary apps, per-app transition hooks | — |
| Risk | Some gestures collide with OEM gesture nav; lock screen depth limited | Maintainability: must track AOSP releases, GMS/compat implications |
| Ship time | Weeks | Quarters |

**Decision: build the experience layer as a portable module set that compiles into both.**
Path A ships first and validates the feel; Path B reuses the same motion engine and surfaces.

## 2. Module map

```
NOVA OS
├── NovaCore            (System UI shell: status, nav, surfaces, power, permission UI)
├── NovaExperience      (Home / Dynamic Space, app launch surfaces)
├── NovaLauncher        (Dynamic Space host + card suggestions)
├── NovaMotion          (tokens, springs, gesture progress, depth, themes, sound hook)
├── NovaWindowManager   (card/window/space/panel lifecycle, split, focus, Z-order)
├── NovaEventEngine     (events → cards → orb; priority, bundling, quiet states)
├── NovaGesture         (edge/bottom/top/corner zones; predictive-back integration)
├── NovaControl         (radial control surface)
├── NovaFind            (everything search: local index, ranking, in-place actions)
├── NovaCanvas          (2D workspace, groups, memory spaces, resume)
├── NovaIntelligence    (on-device intent engine, suggestions, workspace memory)
├── NovaSettings        (NOVA surfaces for settings + motion profiles/themes)
├── NovaSecurity        (privacy center, permission language, sensor audit)
└── AOSP Base           (Android platform: boot, encryption, sandbox, HALs)
```

## 3. Responsibilities & boundaries

| Module | Owns | Never does |
| --- | --- | --- |
| `NovaMotion` | The *only* animation authority; tokens, springs, profiles, themes, depth, perf gates | Know about specific apps or content |
| `NovaWindowManager` | Shape lifecycle (card/window/space/panel), focus, split ratios, Z-order | Draw UI itself |
| `NovaGesture` | Zone arbitration, progress values, predictive-back bridging, haptics at snap points | Decide product behaviour (that's the surface's job) |
| `NovaEventEngine` | Priority, bundling, deferral, orb lifecycle, quiet hours | Render; it emits state that surfaces observe |
| `NovaCanvas` | Spatial memory of windows, groups, resume snapshots | Manage process memory (that's the OS/Kernel) |
| `NovaFind` | Local index, ranking, action providers | Network anything by default |
| `NovaIntelligence` | On-device intent model, suggestion ranking, explanations | Send data off-device without explicit consent |

## 4. NOVA MOTION on Android

```kotlin
// Package: os.nova.motion
data class NovaSpring(val stiffness: Float, val damping: Float, val mass: Float)

object NovaMotion {
  fun spring(value: Float, target: Float, velocity: Float, cfg: NovaSpring): AnimationState<Float>
  fun open(session: NovaOpenSession)     // shared-element card -> app
  fun close(session: NovaCloseSession)
  fun orbit(center: Offset, items: List<NovaOrbitalItem>, stagger: Long)
  fun progress(gestureId: String): NovaProgress
  fun emit(event: NovaEvent)             // motion + sound + haptic triple
}
```

Implementation notes:

- `NovaMotion` is written against **Compose Animation core + a thin `RenderNode` path** so the same
  engine works inside a plain `Activity` (Path A) and inside `SystemUI` (Path B).
- Progress values are `MotionValue<Float>`-style handles backed by `graphicsLayer` writes, not
  recomposition. Surfaces **never** `setState` per frame.
- Predictive back: `OnBackInvokedCallback` + `backProgress` (`android.window.BackEvent`) feed
  `NovaMotion.progress('back')`; our own edge gesture is used only where the platform doesn't
  supply progress, and it is disabled when the platform animator handles it.
- Shared elements: `SharedTransitionScope` (Compose) for in-process surfaces; for cross-app
  (Gallery → WhatsApp) we use a `SurfaceControl`-based transition in Path B and intent chaining +
  a rendered hand-off frame in Path A.

## 5. Data & state

```
NovaState (single source of truth)
├── workspace   : { windows[], groups[], focus, split }
├── events      : { items[], orb, quiet }
├── motion      : { profile, theme, tokens, stats }
├── surfaces    : { home, canvas, core, flow, control, lock }
└── intelligence: { suggestions[], memory, consents }
```

- Unidirectional flow; surfaces are pure renderings of state + a gesture stream.
- Workspace snapshots are serialized (`workspace.json`) so Memory Spaces survive reboot.
- Locally encrypted at rest (Android Keystore keys); intelligence data never leaves the device
  unless the user opts into a cloud feature *and* the payload is shown before sending.

## 6. Permission & security posture

| Area | Approach |
| --- | --- |
| Boot | Verified boot, dm-verity (inherited, unchanged) |
| Storage | File-based encryption; NOVA only reads what a permission or an explicit user drag grants |
| Sensors | Privacy Center audit log (camera/mic/location counts + who/when + revoke) |
| Permission prompts | Consequence language; options `الآن فقط · أثناء الاستخدام · هذه المرة · لا تسمح`; always show *why* |
| Cross-app DnD | Content URIs are granted per-drop, revoked when the drop completes or is cancelled |
| Nearby device handoff | Local transport (Wi-Fi Aware / BT LE), explicit accept on both devices, cancellable at the orb |
| Intelligence | Local-first models; no silent telemetry; an on-device "what NOVA knows" page |

## 7. Performance strategy

1. **Motion is GPU-only.** Transforms, opacity, clip radius — never layout per frame.
2. **Blur is gated.** ≤ 2 live blur layers, ≤ 12 px, only while a transition is in flight.
3. **Idle is idle.** All loops stop under the settle threshold; no wallpaper animation when the
   screen is off or an app is fullscreen-immersive.
4. **Launch path.** Pre-warm likely apps (from NovaIntelligence) with a bounded budget;
   render the surface frame **before** the app's first frame so the morph never shows a splash.
5. **Thermal honesty.** The motion profile multiplier reads thermal state; Cinematic degrades to
   Balanced automatically at `THERMAL_STATUS_SEVERE`, and the user is never lied to — a subtle
   status chip appears in CONTROL.
6. **Instrumentation.** `NovaMotion.stats` exposes frame-time histograms per surface; the
   device lab runs the 12 golden flows on every release candidate.

## 8. Compatibility

- Minimum: Android 13 (predictive back + modern blur + Compose shared elements mature).
- Target: latest AOSP release, Pixel-class device first, then Snapdragon 8-series.
- Path A must work on third-party hardware (Xiaomi/Samsung) with reduced privileges: the launcher
  degrades gracefully — CANVAS stays, system-level DnD across arbitrary apps is limited to
  NOVA-aware apps.
- No custom kernel requirements. No root. No accessibility-service abuse for core gestures
  (accessibility is used only where the platform provides no alternative, and is disclosed in
  Settings → NOVA → Permissions used).

## 9. Repo shape (this repository)

```
Nova-os/
├── README.md
├── package.json           ← scripts: serve + the four checks
├── docs/                  ← the contract (this folder)
├── prototype/             ← Phase 1 interactive proof (web, no runtime deps)
│   ├── index.html         ← device frame + live control deck
│   ├── styles/
│   │   ├── tokens.css     ← color / motion tokens, NOVA Dark + NOVA Paper, accent packs
│   │   ├── shell.css      ← stage, device, wallpaper, status, deck
│   │   └── surfaces.css   ← home, app, CORE, FLOW, orb, CANVAS, split, DnD, CONTROL, lock
│   └── src/
│       ├── motion/
│       │   ├── ticker.js  ← one rAF loop for the whole system + stats
│       │   ├── springs.js ← integration, damping ratio, overshoot cap
│       │   ├── config.js  ← tokens, profiles, themes, accents, spring resolution
│       │   ├── motion.js  ← morph / orbital / panel / depth / emit / velocity cap
│       │   └── gestures.js← zone arbitration + the component drag helper
│       ├── core/
│       │   ├── store.js   ← app catalogue, workspace, events, subscriptions
│       │   ├── dom.js     ← tiny DOM helpers, Arabic date formatting
│       │   ├── icons.js   ← NOVA Icon Language (single-line SVG set)
│       │   ├── sound.js   ← WebAudio-synthesised sound set (no assets)
│       │   └── haptics.js ← haptic patterns + energy budget
│       ├── surfaces/      ← lock, home, app, core, flow, orb, canvas, control, split, dnd
│       └── main.js        ← surface state machine + gesture routing
└── tools/
    ├── lint-motion.sh
    ├── lint-classes.py
    ├── spring-check.mjs
    └── experience-check.mjs
```

Later (Phase 2/3) the Kotlin tree appears as `android/` with the same module boundaries, so
`NovaMotion` has one spec (`docs/02-motion-language.md`) and two implementations.
