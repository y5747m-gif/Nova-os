# 04 — Roadmap

> **ملخص عربي:** أربع مراحل: (1) بروتوتايب يثبت الإحساس، (2) Launcher/System Experience
> كتجربة يومية على أجهزة حقيقية، (3) ROM من AOSP، (4) جهاز NOVA. كل مرحلة ليها معايير خروج
> واضحة، وممنوع نبدأ اللي بعدها قبل ما نعدّي معايير اللي قبلها.

## Phase 1 — Prototype (prove the feel)

**Goal:** make someone *use it* for 10 minutes and miss it on their own phone.

| Deliverable | Status |
| --- | --- |
| NOVA MOTION engine (springs, gesture progress, profiles, themes) | ✅ in `prototype/src/motion` |
| Dynamic Space home | ✅ |
| Continuity app open (card → surface, gesture-controlled) | ✅ |
| Interactive back (progress + predictive feel) | ✅ |
| NOVA CORE (orbital launchpad + search) | ✅ |
| NOVA FLOW (event cards) + Notification Orb | ✅ |
| NOVA CANVAS (2D workspace, drag windows, sweep) | ✅ |
| Split Flow + system-level drag & drop | ✅ |
| NOVA CONTROL (radial) + lock screen + AOD | ✅ |
| Sound set + haptics language | ✅ (WebAudio synth) |
| Kotlin/Compose port of `NovaMotion` | ⏳ Phase 2 start → **springs + tokens + profiles + engine ✅** (`android/app/src/main/java/os/nova/motion/`, golden-curve tested), **Compose shell ⏳** |
| Installable web app (PWA) + Android APK shell | ✅ `android/`, `docs/06-install.md` |

**Exit criteria**

1. A user who has never seen it can send a photo to a person in ≤ 2 gestures without instructions.
2. Zero dropped frames at 60 Hz on a mid-range device (web: 60 fps on a 4-year-old laptop).
3. `Reduced Motion` profile is complete and pleasant (not "broken animations").
4. 5 curated motion themes feel *different*, not just faster.

## Phase 1.5 — Installable build (delivered alongside Phase 1)

`docs/06-install.md`. Two working paths so the experience can leave the browser:

- Installable web app (manifest + service worker, offline shell, home-screen icon, deep links).
- **Android APK**: `android/` — a full-screen WebView shell that serves `assets/www` through
  `WebViewAssetLoader`, with edge-to-edge insets handed to CSS, hardware/gesture **Back** routed
  into NOVA's own navigation, a `CATEGORY_HOME` entry (NOVA can be the home screen), adaptive
  launcher icons, a notification bridge, opt-in boot launch, and a self-update path
  (GitHub Releases → cache → `FileProvider` → system installer).
- CI (`.github/workflows/apk.yml`) runs the quality gates, builds with Gradle 8.9/AGP 8.5.2/JDK 17
  and publishes `nova-os-latest.apk` + a numbered copy + checksums as release assets — the exact
  thing the in-app **تحميل APK** button looks for.
- Known limits are stated in the guide: debug-signed prototype, no cross-app window control,
  no iOS APK (PWA there), notifications of other apps stay Android's.

## Phase 2 — Launcher / System Experience (daily driver)

- Default-launcher replacement: Dynamic Space, CORE, CANVAS as recents, event cards.
- Role-based gesture ownership (`ROLE_HOME`), predictive-back integration on Android 13+.
- Notification listener → event cards; in-place replies; orb overlay while media plays.
- Widgets: NOVA-native widget format (cards that can morph into windows).
- Lock screen: adaptive clock, AOD priorities, quick tools.
- Settings → NOVA (motion profile, motion theme, gesture zones, orb behaviour).
- **DnD v1**: NOVA-aware apps accept drops (person, folder, nearby device).

**Exit criteria:** 2 weeks of personal daily use with ≤ 3 forced fallbacks to stock launcher per day;
crash-free sessions ≥ 99.5 %; battery delta ≤ 3 % vs stock launcher.

## Phase 3 — Custom ROM (NOVA OS as an OS)

- AOSP fork: `NovaSystemUI`, window manager integration (real shapes, real Z-order, split).
- Power menu from press point; boot experience; recovery aesthetics.
- Permission UI + Privacy Center at framework level; sensor audit log.
- Cross-app shared elements via `SurfaceControl` transitions.
- `NovaFind` system-wide index (with explicit per-source opt-in).
- Updates: OTA channel with A/B slots; ROM builds for 1–2 reference devices.

**Exit criteria:** ROM boots on a reference device, passes CTS-relevant smoke tests, motion budgets
met on-device, and Path-A and Path-B produce visually identical motion (same spec, two impls).

## Phase 4 — Device

- Hardware choices that *serve* the language: 120 Hz LTPO, high-quality linear haptics, accurate
  color, gyro for orb drift (opt-in), ultrasonic fingerprint, good thermal headroom.
- Sensor/HAL work: haptics waveform library (NOVA ticks), display profiles (NOVA Dark/Paper),
  audio tuning for the NOVA sound set.
- Manufacturing/regulatory reality: certification of a custom OS variant, carrier/VoLTE constraints,
  app compatibility (GMS or not) — resolve by shipping NOVA OS as an *installable* image first.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Gesture conflicts with OEM nav bars (Path A) | High | Offer "NOVA gestures" only when role/permissions allow; fall back to stock zones and disclose |
| Motion sickness / user annoyance | High | Reduced Motion first-class; conservative defaults; per-gesture opt-out |
| Ecosystem hostility (apps that assume stock recents/notifications) | High | Compatibility shims; never break share/notification semantics; degrade to Android presentation |
| AOSP maintenance treadmill | Medium | Keep NOVA layers in a separate repo tree; rebase per AOSP release; avoid framework forks where a plugin point exists |
| Thermal/battery regressions from 3D & blur | Medium | Hard budgets in `02-motion-language.md` §10; CI perf gates on device lab |
| GMS/compat requirements for a custom ROM | Medium | Phase 3 reference devices first; keep an "Android-clean" mode |
| Scope explosion | High | This roadmap: nothing from a later phase starts before the earlier phase's exit criteria pass |

## Immediate next steps (after this repo's Phase 1)

1. ~~Port `NovaMotion` (springs + tokens + profiles) to Kotlin and unit-test against the same
   golden curves used by the web engine.~~ **Done**: `os.nova.motion` in `android/`, locked to the
   JS engine by `tools/golden-curves.mjs` → `golden-curves.json` → `NovaMotionGoldenTest`
   (runs in `npm run check:port` + `gradle testDebugUnitTest` in CI). The APK shell already proves
   the packaging, insets, Back routing, notifications and self-update paths — the Compose port
   replaces its rendering.
2. Build a 6-screen Compose shell: Lock, Dynamic Space, Surface, CORE, FLOW, CANVAS.
3. Instrument the 12 golden flows with frame-time histograms on a Pixel 6a-class device.
4. Run the first 5-person usability study (send a photo, resume a workspace, defer an event).
