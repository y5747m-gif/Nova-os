# 01 — Experience Specification

> **ملخص عربي:** المستند ده بيوصف كل شاشة وكل إيماءة في النظام: الشاشة الرئيسية (Dynamic Space)،
> فتح التطبيقات بانتقال متصل (morph)، نظام النوافذ (Floating Worlds)، التنقل بثلاث مناطق،
> الإشعارات كـ Event Cards + Orb، NOVA CANVAS، مجموعات التطبيقات، البحث الشامل،
> NOVA CONTROL، شاشة القفل و AOD، Split Flow، والسحب والإفلات على مستوى النظام.

## 0. Surface model

```
LOCK ──swipe up──▶ DYNAMIC SPACE ──tap card──▶ APP SURFACE
                      ▲   ▲                        │
        swipe up ─────┘   └───── swipe down        │ drag down (predictive)
     NOVA CORE            NOVA FLOW ──▶ event app    ▼
        │                                          CANVAS WINDOW
        └──────── drag app onto app ──▶ SPLIT FLOW ◀┘
```

Every surface is one of four *shapes* of the same object:

| Shape | Size | Depth (Z) | Used for |
| --- | --- | --- | --- |
| Card | ≤ 260 dp | 20 | Home, canvas window, event card |
| Window | 40–85 % screen | 50 | Floating world, split pane |
| Space | full screen | 60 | Active app / focused surface |
| Panel | edge-anchored | 70 | CORE, FLOW, CONTROL |

## 1. Lock screen

- The clock is **adaptive**: it is not fixed to the centre; it is composed against the wallpaper
  (bright region detection moves it, weight and size follow contrast).
- Touch the display → the clock shifts slightly (parallax ≤ 6 dp) and the user's tools appear
  (next event, media, quick toggles) with staggered 40 ms delays.
- **Always-On Display** shows `time · battery · one primary event · up to two secondary events`,
  faded in by priority, and fades out anything unimportant.

## 2. Dynamic Space (home)

No icon grid. A calm animated background with only what matters now:

```
 19:42                            72% ▮
        أهلاً ياسين
        الأربعاء، 21 سبتمبر
   ┌───────────────────────────┐
   │  ⏱  المهمة القادمة         │   ← live card (event, not widget)
   │  اجتماع بعد 25 دقيقة      │
   └───────────────────────────┘
        ◯      ◯      ◯            ← context ring: apps likely needed now
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ← pull up: NOVA CORE
```

Rules:

- Cards are **not user-placed widgets**; they are suggestions produced by NOVA INTELLIGENCE
  (time of day, calendar, commute, last workspace).
- Ordering is explainable: long-press a card → "why am I seeing this?".
- A card can be pinned, which freezes its position permanently.
- The ring does not rotate endlessly; it responds to touch and settles (Orbit motion theme only).

## 3. Opening an app — continuity

```
Home Card ──▶ Lift ──▶ Expand ──▶ Morph ──▶ Application           320–420 ms
```

- The transition is a **shared element** transition: the card's bounds are the start rect,
  the surface's bounds are the end rect; everything is one transform.
- The gesture starts the animation: touch-down gives an immediate 12 px lift (so the UI answers
  before the app has launched), and the app's first frame is composited *inside* the expanding
  surface — never a splash screen behind it.
- The app receives the morph progress so its own content can stagger in (header first, body at ≥ 60 %).
- Cancel mid-flight (drag back) → springs home, no app switch recorded.

## 4. Windows — Floating Worlds

- Every app can be a **card**, a **window**, a **space**, or a **panel** — the same instance moves
  between shapes, it does not restart.
- Windows are not plain Android rectangles: each has **motion + depth + state**
  (`idle`, `active`, `dimmed`, `pinned`, `loading`).
- Depth is real in the model: `Background Z=0 · Cards Z=20 · Active window Z=50 · Dialog Z=100`.
  Raising a window lowers the background visually and brightens the window; nothing fake-blurs
  full-screen without a frame budget.

## 5. Navigation — three gesture zones

| Zone | Gesture | Result |
| --- | --- | --- |
| Right edge | drag left→right (RTL aware) | **Back**, progress-driven. Current surface translates/scales, previous surface peeks behind it. Cancel returns smoothly. Hardware/gesture Back follows the identical rule: an app returns to the surface it was opened *from* (home, or the canvas it came out of). |
| Bottom | drag up | **NOVA CORE** (two-stage: peek at 30 %, commit at 55 % + velocity) |
| Top | drag down | **NOVA FLOW** (two-stage, same thresholds) |

Built on Android's predictive-back progress callbacks where available (API 33+), with a
compatible fallback implemented in the shell — never a competing Back stack.

## 6. NOVA FLOW — events, not notifications

An event card, with the actions that matter, inline:

```
┌─────────────────────────────┐
│ 💬 محمد                      │
│ عايز يكلمك                   │
│ [رد]            [اتصال]      │
└─────────────────────────────┘
```

- Cards animate in **live**: they arrive with motion, then settle and stack by priority
  (person > task > service > promo). Promotions are collapsed into a single quiet group.
- Swiping a card away is *deferral*, not dismissal: it returns when its context returns.
- Bundling: same person + same thread = one card that updates in place.

## 7. The Orb — non-interruption

When an event arrives while the user is watching media:

```
                  ●        ← orb appears at the edge, never a banner
   drag ● ────────────────▶ card
   tap  card ─────────────▶ full app
```

- The orb has weight: it drifts, it leans with the device (gyro, optional), and it pulses once
  (200 ms, 4 % scale) — then it stops. **No sound, no haptic** unless the event is a call.
- Stale orbs fade to 40 % after 60 s and vanish after 5 min without interaction.
- Nothing else may overlay the media surface: calls are the single exception, and they use
  the orb expanded to a call card, not a full-screen hijack.

## 8. NOVA MOTION — motion language

Defined in `02-motion-language.md`. Types: **Morph, Orbital, Elastic, Depth, Gesture-driven**,
each with a signature and a budget. Duration bands: 160 / 320 / 480 / 650 ms, and duration is
never the primary control — distance, velocity and device state decide.

## 9. Closing an app — memory card

```
FULL APP ──▶ shrink ──▶ CARD ──▶ settle into the canvas      (state preserved)
```

Closing is **not** killing. The app keeps its state; the canvas keeps its place; the system
reclaims resources on its own schedule (LMK-aware, state-snapshot first).

## 10. NOVA CANVAS (recents)

- Two-dimensional, pannable, zoomable space. Windows keep **spatial memory**: a window you left
  at the top-right is still at the top-right.
- Drag windows freely; overlap is expected; the focused one is raised, others dim to 70 %.
- **Sweep** (a fast arc from the bottom) pushes windows off like sheets — a gesture, not a button
  labelled "close all". Resource management is the system's job, not the user's.
- Groups pin windows into one region:
  `✈️ Trip` = Maps + Browser + WhatsApp + Gallery + Booking, opened together, resumed together.

## 11. NOVA FIND (search)

Type `محمد` → one result space with sections: conversations, media, contacts, files, messages,
events, apps, actions. Ranking is local, on-device, and context-weighted (time, place, active
workspace). Results are **actionable in place**: reply, call, share, open in split — without
navigating away.

## 12. NOVA CONTROL

A radial surface (not a grid of toggles). Elements sit on a ring around a centre node,
and they physically follow the finger; releasing past a threshold commits a change
(e.g. drag brightness around the ring = continuous, not tap-to-cycle).

## 13. Split Flow (multitasking)

Drag a target app from CORE onto a running surface:

```
┌─────────────────────┐
│       YouTube       │   ← host
│─────────────── ✱    │   ← interactive divider (drag, snap points 25/50/75)
│ WhatsApp            │   ← guest, morphing from its card
└─────────────────────┘
```

- Pairs can be saved as a **space** and resumed later (Memory Spaces).
- Divider has snap points and haptics at each snap; below 20 % the guest collapses to a card.

## 14. System-level drag & drop

One drag gesture, many destination classes:

| Destination | Behaviour |
| --- | --- |
| Person | Opens the conversation with the content staged ("الصورة جاهزة للإرسال") |
| App | Opens the app in the correct mode (e.g. Notes → insert) |
| Folder / space | Files the content, keeps source linked |
| Nearby device | Hands off over the local transport, with progress + cancel on the orb |
| Canvas window | Drops content into that app's surface directly |

Targets light up progressively as the pointer approaches (proximity intensity), and the drag
shows the **content**, not an icon placeholder.

## 15. App handoff (Gallery → WhatsApp)

When the user moves from one app to another *with content*, the content becomes the transition
point: it flies along the path, the source app stays visible as the previous surface, and the
destination opens already knowing what it received. This is the "the system connected the two
operations" feeling — implemented as shared-element + intent chaining, no new Back stack.

## 16. Power menu

Press power → the menu **grows from the press point like an orb** (never a centred modal):
`Restart · Power off · Emergency`. Long-press → emergency actions directly.

## 17. Security & permissions

- Platform baseline: verified boot, file-based encryption, sandboxed apps, biometrics, secure
  storage — untouched.
- **Privacy Center**: camera used 4×, location 2×, microphone 1× — with who/when and a one-tap revoke.
- Permission prompts use consequence language and offer `الآن فقط · أثناء الاستخدام · هذه المرة · لا تسمح`
  with an always-visible "why".

## 18. Icon language

Not Material icons as the identity. **NOVA Icon Language**: one line weight, one geometric
container, deliberate inner negative space, 24 dp grid, optical corrections at small sizes,
animated only through NOVA MOTION tokens.

## 19. Sound & haptics

Sound set: open = soft pulse, close = low fade, success = double tone, error = short descending
tone. Haptics: open = light tap, drag = micro ticks proportional to movement, arrival at a snap
point = stronger tick, success = two pulses. Both are **part of the motion contract** — the same
event must produce a consistent motion + sound + haptic triple.

## 20. Performance modes

`Cinematic · Balanced · Fast · Reduced Motion` — the user chooses, and every subsystem must
honour it (motion, parallax, blur, orb drift, sound density).
