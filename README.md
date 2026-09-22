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
| `docs/06-install.md` | PWA install, APK build (CI + local), signing, self-update, known limits. |
| `tools/` | Motion lint, class lint, spring physics tests, experience (golden-flow) checks, icon + asset staging, version bump. |
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

**Live site (no setup):** the NOVA URL is deployed automatically on every push:

- **https://y5747m-gif.github.io/Nova-os/** — GitHub Pages, published by
  `.github/workflows/pages.yml` (runs the quality gates first; a broken prototype never deploys).
- **https://nova-os-topaz-rho.vercel.app** — Vercel Production (auto-builds from `main`;
  `vercel.json` makes `prototype/` the site root).

That URL is also what the PWA installs from (`docs/06-install.md` §1).

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
resume workspace, power menu, privacy, AOD, lock, sweep). Keyboard: `K` CORE · `F` FLOW · `C` canvas ·
`E` event · `M` media · `R` resume · `P` power · `L` lock · `S` sweep · `I` install · `U` apply update ·
`Esc` back.

## Checks

```bash
npm install      # jsdom (dev only), for the experience check
npm run check    # the four gates below
```

| Command | What it proves |
| --- | --- |
| `npm run check:motion` | Motion lint: no hand-rolled rAF, no ad-hoc easing, no inline transitions outside the engine. |
| `npm run check:classes` | Every class the JS builds exists in the CSS (no silent unstyled surface). |
| `npm run check:springs` | 109 physics assertions: every profile × theme stays inside the 6 % overshoot budget, settles in time, and Reduced Motion is critically damped with no blur/arcs. |
| `npm run check:experience` | 50 assertions driving the real modules through jsdom: unlock, morph, interactive back, NovaBack's whole stack, CORE, FLOW, orb, canvas, drag & drop, split flow, sweep, the install sheet, the config matrix, and version/manifest consistency. |

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

Phase 1 (Prototype). The docs are the contract; the web prototype is the proof of feel.
See `docs/04-roadmap.md` for what comes next (Launcher/SystemUI → AOSP ROM → device).

## Naming

Product: **NOVA OS** · Experience layer: **NOVA EXPERIENCE** · System UI: **NOVA CORE** ·
Motion: **NOVA MOTION** · Search: **NOVA FIND** · Assistant: **NOVA INTELLIGENCE** ·
Recents: **NOVA CANVAS** · Events: **NOVA FLOW** · Controls: **NOVA CONTROL**.
