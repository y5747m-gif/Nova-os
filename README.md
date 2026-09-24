# NOVA OS

**A New Way to Use Your Phone** — نظام تشغيل بواجهة مبنيّة على السؤال:
مش "أين التطبيق؟" بل **"ما الذي تريد فعله؟"**

> ### ملخص عربي
> NOVA OS هو إعادة تصميم لتجربة المستخدم فوق AOSP: بدل *تطبيقات → افتح → Back → Home*،
> النظام يشتغل بـ **مساحات → بطاقات → إجراءات → انتقالات**. مفيش Home Screen تقليدي،
> مفيش Notification Shade تقليدي، مفيش Recent Apps رأسي. فيه **NOVA MOTION** كمحرّك حركة
> واحد للنظام كله (spring physics + gesture-driven)، و**NOVA CORE** كمركز، و**NOVA FLOW**
> كمركز أحداث، و**NOVA CANVAS** كمساحة ثنائية الأبعاد للتطبيقات المفتوحة، و**NOVA FIND**
> للبحث الشامل، و**NOVA INTELLIGENCE** كذكاء يفهم حالة النظام.
> من الإصدار 0.5: **كرة التطبيقات** حلقة حيّة تدور على كل التطبيقات، ودرج **كل التطبيقات**
> يعرض الهاتف كاملًا (35 تطبيقًا في البروتوتايب / كل التطبيقات المثبّتة في الـAPK)، وتطبيق
> **«الإعدادات»** غيّر منه **الخلفية** (10 مشاهد حيّة + صورة من جهازك + خلفية النظام على أندرويد)
> والمظهر واللون والحركة والصوت — كله يُحفظ على الجهاز.
>
> المستودع ده فيه حاجتين: **التوثيق الكامل** (تحت `docs/`) و**بروتوتايب تفاعلي** شغّال
> (تحت `prototype/`) بيجرّب الحركة بالإصبع والفيزياء فعليًا في المتصفح.

---

## Repository map

| Path | What it is |
| --- | --- |
| `docs/00-vision.md` | Philosophy, product principles, layer naming (CORE / MOTION / FLOW / CANVAS / FIND / INTELLIGENCE). |
| `docs/01-experience-spec.md` | Screen-by-screen and gesture-by-gesture specification of the whole experience. |
| `docs/02-motion-language.md` | NOVA Motion Language: tokens, springs, gesture-driven progress, depth, profiles, perf budgets, API. |
| `docs/03-architecture.md` | Module architecture, AOSP integration strategy (Launcher-first vs ROM), security model. |
| `docs/04-roadmap.md` | The 4 phases: Prototype → System Experience → ROM → Device, with exit criteria and risks. |
| `docs/05-design-tokens.md` | Color (dark/light), typography, spacing, radii, elevation, sound set, haptic set. |
| `prototype/` | Zero-dependency interactive web prototype of the NOVA experience (Arabic RTL UI). |
| `docs/07-launcher-stability.md` | Stable Android HOME behaviour, settings-only launcher change, recovery and device test checklist. |
| `docs/06-install.md` | PWA install, APK build (CI + local), signing, self-update, known limits. |
| `tools/` | Motion lint, class lint, spring physics tests, experience (golden-flow) checks, golden-curve generation + Kotlin port parity, the **shipping harness** (deploy-check: local deployability + live delivery verification + red/green selftest), icon + asset staging, version bump. |
| `package.json` | `npm run serve` + `npm run check`. |

## Install it on a phone

Two real paths — full guide in **`docs/06-install.md`**:

1. **Right now, as an app (PWA).** Open the NOVA URL on your phone → inside NOVA:
   **تحميل على الهاتف → ثبّت الآن**. It lands on the home screen, opens full-screen and works
   offline after the first load. iPhone: open in Safari → Share → *Add to Home Screen*.
   > A build is **already published** for this repo: **Releases → `nova-os-latest.apk`**
   > (verified in CI: `os.nova.launcher`, v0.1.0, minSdk 26, 38 `assets/www` files inside).
2. **As an Android APK (`android/`).** A **real launcher**: your installed apps with real icons,
   one-tap default-Home setup wizard, live notifications in NOVA FLOW, usage-ranked suggestions,
   contacts search, system widgets, deep shortcuts, your own wallpaper behind NOVA's glass,
   edge-to-edge insets, hardware Back wired into NOVA's navigation, and self-update.
   CI builds it: **Actions → Build NOVA OS APK → Run workflow** →
   the APK appears under **Releases** as `nova-os-latest.apk`. The in-app **تحميل APK** button
   finds that asset automatically and, inside the app, downloads it and opens the system installer.
   Locally: `bash tools/stage-assets.sh && cd android && gradle assembleDebug`.

| File | What it is |
| --- | --- |
| `prototype/manifest.webmanifest`, `prototype/sw.js` | Installable web app + offline shell. |
| `android/` | The APK project (Kotlin, AGP 8.5, minSdk 26, WebViewAssetLoader). |
| `.github/workflows/apk.yml` | Builds the APK, runs the quality gates, publishes the release asset. |
| `.github/workflows/pages.yml` | Deploys `prototype/` to GitHub Pages — the live NOVA URL. |
| `tools/stage-assets.sh` | Copies the web experience into the APK assets. |
| `tools/make-icons.sh` | Regenerates every launcher/PWA icon from the icon master. |
| `tools/bump-version.mjs` | One command keeps `VERSION`, `version.js` and `sw.js` in sync. |

## Run the prototype

**Deployment options:** these require the host setup below before the site is public:

- **https://y5747m-gif.github.io/Nova-os/** — GitHub Pages, published by
  `.github/workflows/pages.yml` (runs the quality gates first; a broken prototype never deploys).
  The deploy job ends with the **shipping harness** (`tools/deploy-check.mjs --live`): the deploy
  only counts as done once the site is proven to answer with the pushed version. One-time setup:
  the repo must have **Settings → Pages → Source = GitHub Actions** (the harness says exactly this
  when it is missing).
- **Vercel:** open the production domain shown in the
  [project dashboard](https://vercel.com/y5747m-gif/nova-os). The previously documented
  domain returns `DEPLOYMENT_NOT_FOUND`; see [Vercel recovery](docs/06-install.md#vercel-recovery).
  `vercel.json` serves `prototype/` without a framework or build step.

The working public URL is also what the PWA installs from (`docs/06-install.md` §1).

```bash
# from the repo root
npm run serve          # python3 -m http.server 8080 --bind 0.0.0.0 --directory prototype
# then open http://localhost:8080
```

No build step and no runtime dependencies — plain ES modules + CSS. (Google Fonts is the only
network request, for IBM Plex Sans Arabic; the CSS falls back to system fonts offline.)

### Phone layout on a desktop

Open `…/index.html?shell=app` to preview exactly what the APK shows: no device frame, no deck,
safe-area insets, full-screen surfaces.

### On a desktop, use the control deck

The panel next to the phone drives everything a thumb would: motion profile, motion theme,
NOVA Dark / Paper, accent packs, and 12 scenarios (new event, media, canvas, FLOW, CORE, CONTROL,
resume workspace, power menu, privacy, AOD, lock, sweep).

**Keyboard (mouse + keys are first-class on a computer):**

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `K` | NOVA CORE | `I` | install the PWA |
| `F` | NOVA FLOW | `W` | settings |
| `C` | NOVA CANVAS | `U` | apply update |
| `T` | NOVA CONTROL | `N` | Do Not Disturb on/off |
| `E` | new event | `D` | desktop ↔ phone shell |
| `M` | media playback | `?` | keyboard help overlay |
| `R` | resume last workspace | `Esc` | interactive back |
| `P` · `L` · `S` | power · lock · sweep | | |

### NOVA on a computer (desktop shell)

Open `…/index.html?shell=desktop` — or just use a window **≥ 1200 px** wide: NOVA leaves the phone
frame and **fills the whole window**. The control deck becomes a floating overlay panel (the
`لوحة NOVA` tool, bottom-right, or hotkey-driven), the **NOVA dock** pins open apps + favourites at
the bottom of the screen, wheel **zooms NOVA CANVAS**, every window has **close /
maximize** controls (double-click the title bar to maximize too), and the floating tools offer
*عرض الهاتف* to drop back into the phone frame. Hotkey `D` or `?shell=web` returns any time —
the choice sticks in the URL.

## Checks

```bash
npm install      # jsdom (dev only), for the experience check
npm run check    # the six gates below
```

| Command | What it proves |
| --- | --- |
| `npm run check:motion` | Motion lint: no hand-rolled rAF, no ad-hoc easing, no inline transitions outside the engine. |
| `npm run check:classes` | Every class the JS builds exists in the CSS (no silent unstyled surface). |
| `npm run check:springs` | 109 physics assertions: every profile × theme stays inside the 6 % overshoot budget, settles in time, and Reduced Motion is critically damped with no blur/arcs. |
| `npm run check:port` | Kotlin port parity (Phase 2): `golden-curves.json` is fresh against the JS engine, the Kotlin springs/tokens/guard constants match `springs.js`/`config.js`, and the JVM test suite + CI step are wired. |
| `npm run check:experience` | 134 assertions driving the real modules through jsdom: unlock, morph, interactive back, NovaBack's whole stack, CORE, FLOW, orb, canvas, drag & drop, split flow, sweep, the install sheet, the config matrix, version/manifest consistency — plus the desktop/feature pack: real battery status, `setShell` desktop↔phone, the dock, the `?` help overlay, keyboard parity (`T`/`N`/`D`), DND quiet events with no orb, sound + reduce-motion CONTROL nodes, persisted notes/tasks, calculator tape, terminal commands, wheel zoom, window close/maximize, and card long-press pinning. |
| `npm run check:deploy` | The shipping harness (`tools/deploy-check.mjs`): every file `index.html` references exists, the manifest is valid and relative-pathed, the service worker precaches the **whole module graph** (walked statically), the workflow contract is intact, versions agree. `npm run check:deploy:live` additionally proves the deployed site answers with this version and the APK asset downloads; `npm run check:deploy:selftest` corrupts a scratch copy three ways and asserts the harness turns RED (a harness that cannot fail is a rubber stamp). |

The other half of the motion contract runs on the JVM — `gradle testDebugUnitTest` inside `android/`
(CI runs it before every APK build): `NovaMotionGoldenTest` + `SpringTest` replay
**`golden-curves.json`** (generated by `npm run golden` from the JS engine) sample-for-sample —
every profile × theme, the release-velocity budget, mid-flight re-targeting — plus the physics and
engine behaviour. No-JUnit variant: `os.nova.motion.GoldenMain`.

## The prototype covers

- **Lock screen** with an adaptive clock and swipe-to-enter.
- **Dynamic Space** home: greeting, live context, and cards that reorder by time of day.
- **Continuity open**: the card you tap *morphs* into the app surface (shared-element, gesture-controllable).
- **Interactive back** (drag from the right edge): the screen follows your finger, the previous surface peeks behind, release decides complete/cancel by position **and velocity**.
- **NOVA CORE** (swipe up from the bottom): orbital launchpad with search, apps, people, files, actions —
  and a full **app drawer** tab (كل التطبيقات): every installed app in an alphabetical grid with
  real icons, Arabic-aware search normalisation, and long-press deep shortcuts.
- **NOVA FLOW** (swipe down from the top): event cards with inline actions instead of a notification list.
- **Notification Orb**: while media plays, events collapse into an edge orb you must pull — nothing interrupts.
- **NOVA CANVAS**: open apps live in a 2D pannable space; drag windows, sweep to close.
- **Split Flow**: drag an app from CORE onto another to build an interactive split with a draggable divider.
- **System-level drag & drop**: drag a photo out of Gallery onto a person, an app, a folder, or a nearby device.
- **NOVA CONTROL**: a radial control surface whose elements follow your finger.
- **NOVA MOTION engine**: real spring solver (stiffness / damping / mass / velocity), motion profiles (Cinematic / Balanced / Fast / Reduced Motion), and motion themes (Aurora / Orbit / Liquid / Minimal / Neon).
- **Sound + haptics**: NOVA's sound set is synthesized live with WebAudio (no assets), haptics via `navigator.vibrate`.

## Status

Phase 1 (Prototype) delivered; **Phase 2 started**: `NovaMotion` now exists twice with one spec —
the web reference and the Kotlin port in `android/…/os/nova/motion/`, locked together by the
golden curves in `npm run check:port` + `gradle testDebugUnitTest`.
See `docs/04-roadmap.md` for what comes next (Compose shell → AOSP ROM → device).

## Naming

Product: **NOVA OS** · Experience layer: **NOVA EXPERIENCE** · System UI: **NOVA CORE** ·
Motion: **NOVA MOTION** · Search: **NOVA FIND** · Assistant: **NOVA INTELLIGENCE** ·
Recents: **NOVA CANVAS** · Events: **NOVA FLOW** · Controls: **NOVA CONTROL**.

---

## NOVA OS 1.0 — Complete Implementation

**A New Way to Use Your Phone — Intent → Interaction → Motion → Action → Completion**

NOVA OS 1.0 implements the full spec:

### Core Engines (per spec #58)
- **nova-tokens**: Design Tokens — Colors (#06070A/#0E1117/#F4F6FA Dark, #F4F6F8/#FFFFFF/#101217 Light), Typography (IBM Plex Sans Arabic), Spacing, Radius, Elevation, Glass, Motion, Haptics, Sound
- **nova-glass**: Glass Clear/Soft/Solid/Ultra + Adaptive (High→Ultra, Mid→Soft, Low→Solid) + Rendering (clipped, cached, GPU)
- **nova-shapes**: Orb, Capsule, Prism, Ring, Crystal, Node, Arc, Ribbon — interactive, usage mapping (Wi-Fi Orb, Battery Ring 72%, etc.), Orb states (Idle, Listening, Thinking, Processing, Success, Error)
- **nova-motion**: Official API open()/close()/morph()/expand()/collapse()/spring()/orbit()/reveal()/transition() + Text Motion (Word Rise, Letter Flow, Blur-to-Clear, Morph Text, Number Morph)
- **nova-gesture**: Swipe, Drag, Long Press, Pinch, Edge Swipe, Pull, Hold, Release — gesture-driven, zones bottom/top/right/corner/surface/center
- **nova-performance**: FPS, GPU, Memory, Thermal, Device Tier — auto downgrade, modes Ultra/Balanced/Performance/Battery/Reduced
- **nova-haptics**: Patterns + budget 40/min
- **nova-audio**: Sound Pack short/quiet/clear, not annoying

### Surfaces
- **NOVA SPACE**: Home not App Grid — Time, Date, Battery, Events, Tasks, Widgets, Actions, Recent Apps, Orb + Living Background (gradients, light blobs, slow movement, depth)
- **NOVA CORE**: Orbital launchpad
- **NOVA CANVAS**: 2D workspace, Cards with Depth/Shadow/Glass/Motion/Position, draggable
- **NOVA FLOW**: Glass Event Card Orb→Card→Event, no cover, actions [Reply][Call][Open]
- **NOVA CONTROL**: Glass Canvas with Orbs, Rings, Arcs, Nodes — Brightness Arc around finger, Battery Ring 72%
- **NOVA FIND**: Glass Orb→Search Surface, Apps/Files/Contacts/Photos/Messages/Settings/Spaces/Actions, Relevant→Secondary→Other
- **NOVA SPACES**: Work, Travel, Study, Gaming, Personal — Depth Zoom + Parallax + Morph + Reveal 300-500ms
- **NOVA AI**: Orb states, local-first, confirmation for sensitive, "افتح آخر Workspace"
- **NOVA SECURITY**: Permissions, Privacy, Encryption file-based, Audit log
- **NOVA SETTINGS**: Appearance, Motion (Cinematic/Balanced/Fast/Minimal/Reduced), Glass (Clear/Soft/Solid presets), Sound, Haptics, Gestures, Performance, Accessibility (Reduce Transparency → Solid)

### Android (Kotlin)
- Tokens, Glass, Shapes, Performance, Gesture, Security, AI, Spaces, Audio, Find, Settings, Haptics — all ported to Kotlin with Compose support
- Performance: 60 FPS target, 90/120Hz, frame-rate independent, thermal/battery/memory handling
- Stability: No lag, leaks, ANR, excessive GPU/CPU, lifecycle correct

### Docs
- `08-nova-os-complete.md`: Full implementation
- `09-aosp-integration.md`: AOSP ROM plan (SystemUI, WindowManager, Boot NOVA→Orb→Ring→Crystal→NOVA OS→Home)
- `10-testing.md`: Unit, UI, Gesture, Performance, Memory, Animation, Accessibility, Battery, Thermal, E2E 12 flows
- `11-performance-optimization.md`: Frame stability, memory, thermal, battery, glass optimization
- `12-final-delivery.md`: Delivery summary

### Checks
```
npm run check  # 109 springs + 66 port + 134 experience + 17 deploy = all passing
```

### Philosophy
- Fast, Fluid, Stable, Modern, Original, Accessible, Efficient, Scalable
- Every animation serves Navigation/Feedback/Hierarchy/Continuity/Orientation
- Every glass serves Hierarchy/Depth/Focus
- Every shape serves Status/Action/Navigation
- Premium, Futuristic, Minimal — Glass + Depth + Light + Motion (NOVA GLASS, not traditional glassmorphism)

