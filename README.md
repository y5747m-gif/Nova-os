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
| `tools/` | Motion lint, class lint, spring physics tests, experience (golden-flow) checks. |
| `package.json` | `npm run serve` + `npm run check`. |

## Run the prototype

```bash
# from the repo root
npm run serve          # python3 -m http.server 8080 --bind 0.0.0.0 --directory prototype
# then open http://localhost:8080
```

No build step and no runtime dependencies — plain ES modules + CSS. (Google Fonts is the only
network request, for IBM Plex Sans Arabic; the CSS falls back to system fonts offline.)

### On a desktop, use the control deck

The panel next to the phone drives everything a thumb would: motion profile, motion theme,
NOVA Dark / Paper, accent packs, and 12 scenarios (new event, media, canvas, FLOW, CORE, CONTROL,
resume workspace, power menu, privacy, AOD, lock, sweep). Keyboard: `K` CORE · `F` FLOW · `C` canvas ·
`E` event · `M` media · `R` resume · `P` power · `L` lock · `S` sweep · `Esc` back.

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
| `npm run check:experience` | 35 assertions driving the real modules through jsdom: unlock, morph, interactive back, CORE, FLOW, orb, canvas, drag & drop, split flow, sweep, the whole config matrix. |

## The prototype covers

- **Lock screen** with an adaptive clock and swipe-to-enter.
- **Dynamic Space** home: greeting, live context, and cards that reorder by time of day.
- **Continuity open**: the card you tap *morphs* into the app surface (shared-element, gesture-controllable).
- **Interactive back** (drag from the right edge): the screen follows your finger, the previous surface peeks behind, release decides complete/cancel by position **and velocity**.
- **NOVA CORE** (swipe up from the bottom): orbital launchpad with search, apps, people, files, actions.
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
