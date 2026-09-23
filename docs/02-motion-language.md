# 02 — NOVA Motion Language

> **ملخص عربي:** الحركة في NOVA مش "تأثيرات" متفرقة، لكن لغة واحدة: التوكنات، الفيزياء
> (stiffness / damping / mass / velocity)، والحركة اللي بيسوقها الإصبع (gesture-driven progress).
> كل عنصر له عمق (Z)، وكل انتقال قابل للإلغاء في أي لحظة. وفيه 4 بروفايلات أداء + 5 ثيمات حركة
> بتغيّر *سلوك* النظام، مش لونه بس.

## 1. Principles

| # | Principle | Consequence in code |
| --- | --- | --- |
| M1 | **The gesture is the clock.** | Progress is a value `p ∈ [0,1]` owned by the gesture, consumed by visuals each frame. |
| M2 | **Release hands over to physics.** | On release, the same value is animated to 0 or 1 by a spring seeded with the release velocity. |
| M3 | **Nothing is a cut.** | Every surface change is a transform of existing elements (shared element), never a swap. |
| M4 | **Time is a fallback, not a rule.** | Duration tokens exist for non-spatial transitions (fades, state colors) only. |
| M5 | **Depth is data.** | Z levels are declared per surface class and drive scale, shadow, dim, and blur budget. |
| M6 | **Always interruptible.** | Springs can be re-targeted mid-flight without a visual jump (velocity is preserved). |
| M7 | **Silence when unseen.** | Animations pause when the surface isn't visible or the app window isn't focused. |
| M8 | **One event = motion + sound + haptic.** | Emitted by a single `NovaMotion.emit()` call; never answered in three different places. |

## 2. Motion tokens

```js
NOVA_MOTION_FAST   = 160ms   // state tints, ripples, icon morphs
NOVA_MOTION_NORMAL = 320ms   // card → app, panel open, split build
NOVA_MOTION_SLOW   = 480ms   // canvas zoom, workspace resume
NOVA_MOTION_LONG   = 650ms   // boot, lock → space, group expansion
```

Duration is **not** the primary control. The engine computes a perceived duration:

```
duration ≈ clamp(base, min, max) · f(distance, velocity, deviceState)
   f grows with distance, shrinks with gesture velocity, and grows on thermal throttle
```

`deviceState` inputs: refresh rate, thermal level, battery saver, `LowPowerMode`, frame budget.

## 3. Springs (the real controls)

```js
// prototype/src/motion/springs.js — mirrored in Kotlin as NovaSpring
NOVA_SPRING_SOFT    = { stiffness: 180, damping: 22, mass: 1    }  // panels, sheets
NOVA_SPRING_SNAP    = { stiffness: 320, damping: 30, mass: 1    }  // buttons, toggles
NOVA_SPRING_LIQUID  = { stiffness: 120, damping: 14, mass: 1.1  }  // Liquid motion theme
NOVA_SPRING_ORBIT   = { stiffness: 240, damping: 20, mass: 0.9  }  // Orbital motion theme
NOVA_SPRING_ELASTIC = { stiffness: 260, damping: 16, mass: 1    }  // home cells, small overshoot
NOVA_SPRING_HEAVY   = { stiffness: 90,  damping: 26, mass: 1.6  }  // windows, canvas panes
```

Rules (all enforced by `tools/spring-check.mjs`):

- **Settle is travel-relative**: a spring stops when `|x − target| < max(0.002, 0.6 % of travel)`
  (never more than 0.5 px) *and* `|v| < 8 × that`. This is what lets a 0→1 progress spring and a
  620 px panel spring stop at the same visual moment — and it removes the classic "snap at 60 %"
  bug you get from a pixel threshold applied to normalised values. When it settles, the frame
  loop stops on its own (`ticker.js`).
- Overshoot is only allowed for `ELASTIC` and `LIQUID`, and capped at **6 % of travel**.
  Peak overshoot is `e^(−πζ/√(1−ζ²))`, so 6 % needs **ζ ≥ 0.667**; `capOvershoot()` clamps any
  wilder spring to **ζ = 0.68** (≈ 5.4 %).
- **Release velocity is capped** (`capReleaseVelocity`): `|v₀| ≤ 0.32 · ω · remaining`, with
  `ω = √(k/m)`. A flick may add energy, but it can never break the overshoot budget.
- A spring seeded with user velocity must never move backwards before reaching its target
  (no visible rubber-band on commit).
- Reduced Motion uses `criticallyDamped()` (ζ = 1) for every spring, so the state change is
  honest position interpolation with no bounce at all.

## 4. The five signature motions

| Motion | Signature | Used by | Budget |
| --- | --- | --- | --- |
| **Morph** | The touched element keeps identity while its geometry changes (card ↔ app, icon ↔ header) | App open/close, DnD drop, split build | 1 transform layer, no cross-fade of the element itself |
| **Orbital** | Elements travel on an arc around a centre of mass, arriving with stagger | CORE open, CONTROL, boot | ≤ 8 concurrent tracks, arc radius from ring geometry |
| **Elastic** | Overshoot then settle, ≤ 6 % travel | Home cells, event card arrival, snap release | spring only, no keyframes |
| **Depth** | Z change causes background recession + window approach (scale, dim, blur budget) | Raise/lower window, dialog, split focus | blur ≤ 12 px and only while motion is in flight |
| **Gesture-driven** | Value is finger position; physics only on release | Back, panels, split divider, orb, canvas pan | must render at display refresh, 0 extra allocations/frame |

## 5. Depth model

```
Z   Class        scale            dim      shadow      blur budget
0   Background   1.00             1.00     none        wallpaper parallax only
20  Card         0.96 → 1.00      0.70     4 → 10 dp   0 px
50  Window       1.00             1.00     18 dp       8 px while in flight
60  Space        1.00             1.00     24 dp       12 px max
70  Panel        1.00             0.55 bg  30 dp       12 px
100 Dialog       0.98             0.45 bg  34 dp       12 px
```

When a window is raised, everything below Z=50 recedes by `1 - 0.04 · z-factor` and dims
by 4–30 %; this is what communicates "the window came closer", never a fake 3D rotation.

## 6. Gesture contract

```ts
type NovaGesture = {
  id: string;
  zones: 'edge-right' | 'bottom' | 'top' | 'surface' | 'corner-top-right';
  axis: 'x' | 'y' | 'radial';
  progress: MotionValue<number>;   // 0..1, driven by the finger
  velocity: MotionValue<number>;   // px/s, low-pass filtered (α = 0.35)
  commit: { position: number; velocity: number };  // e.g. { position: 0.55, velocity: 900 }
  onProgress?(p: number): void;    // visuals only — must be allocation-free
  onRelease(dir: 'commit' | 'cancel'): void;
};
```

Hard rules:

- `commit.position` and `commit.velocity` are the only decision inputs. No timers may decide.
- On cancel, the return spring is seeded with the **current** velocity (never restarts from 0).
- Progress mapping is monotonic and 1:1 with the finger inside a defined band
  (e.g. back-gesture: 1 px of finger = 1 px of surface travel until 35 % of width, then a 0.6 ratio).
- Haptics fire at snap points, not continuously; a drag emits at most ~1 tick per 8 dp.

## 7. Motion profiles

| Profile | Tokens | Springs | Blur | Stagger | Extras |
| --- | --- | --- | --- | --- | --- |
| **Cinematic** | ×1.0 | full | 12 px | 40 ms | Orbital arcs, depth recession, parallax |
| **Balanced** *(default)* | ×0.85 | full | 8 px | 24 ms | Reduced arcs, minimal parallax |
| **Fast** | ×0.55 | stiffer, damped | 0 px | 0 ms | No arcs, no overshoot, straight-line |
| **Reduced Motion** | ×0.35 | critically damped | 0 px | 0 ms | Fades only, no scale beyond 4 %, no parallax, **no orb drift** |

`Reduced Motion` follows the OS accessibility setting and is also selectable manually; every
subsystem must degrade to it, and the CI motion test asserts no scale > 1.04 in that profile.

## 8. Motion themes (behavior, not color)

| Theme | Character | Signature tweaks |
| --- | --- | --- |
| **Aurora** | Soft, wide, slow | `SOFT` springs, 1.1× duration, long fades, gentle stagger |
| **Orbit** | Circular, mechanical | Arc paths for all arrivals, `ORBIT` springs, rotational accents |
| **Liquid** | Late, bouncy | `LIQUID` springs, 6 % overshoot, motion blur trails off by default |
| **Minimal** | Nearly still | 0.6× duration, no overshoot, no arcs, no parallax |
| **Neon** | Fast, bright | 0.75× duration, `SNAP` springs, light bloom on commit (2 frames max) |

Themes change **motion physics and ordering**; color accents are derived separately
(`05-design-tokens.md`) so a user can mix (e.g. Aurora motion + Neon accent) — but the defaults
are curated pairs.

## 9. Engine API (the only way to animate)

```js
// prototype/src/motion/motion.js — the reference implementation
NovaMotion.morph({ el, from, to, radiusFrom, radiusTo, springName, travel,
                   onProgress, onDone, manual })
  → { progress, set(p), release(dir, velocityPx), snap(p), stop() }

NovaMotion.orbital({ items, center, radius, angleOf, stagger, arc, onUpdate })
  → { set(p), release(dir, velocity) }        // NOVA CORE, CONTROL, home ring

NovaMotion.panel({ el, from: 'bottom' | 'top', distance, springName, onProgress })
  → { progress, set(p), release(dir, velocity) }   // CORE / FLOW sheets

NovaMotion.depth({ layers: [{ el, factor, dim, blur }], amount })
  → { set(v), to(v) }        // background recedes, window approaches

NovaMotion.spring({ from, to, velocity, springName, onUpdate, onDone })
NovaMotion.emit(kind)        // one event → motion + sound + haptic
NovaMotion.rectOf(el, container) / duration(token) / stagger(ms) / stats
capReleaseVelocity({ from, to, cfg, velocity })   // the 6 % guard
```

The gesture layer (`motion/gestures.js`) is the only producer of progress values:
`attachGestures(screen, { onStart, onMove, onEnd, isZoneEnabled })` for the four edge zones,
and `draggable(el, { onStart, onMove, onEnd, engage, axis, hold })` for components.
Nothing else may write a transform.

Everything else (CSS transitions, ad-hoc rAF loops, per-screen `ease-in-out`) is **banned**
inside NOVA surfaces. The web prototype enforces this with a lint rule in `tools/lint-motion.sh`.

## 10. Performance budget

| Metric | Budget | Enforcement |
| --- | --- | --- |
| Frames dropped during open morph | ≤ 1 at 60 Hz, ≤ 3 at 120 Hz | frame-time histogram in `NovaMotion.stats` |
| Allocation per animated frame | 0 | preallocated springs, reused transform objects |
| Blur layers live at once | ≤ 2 | depth manager gate |
| Layers per surface | ≤ 12 (Compose: `graphicsLayer` count) | DevTools overlay |
| Battery cost of always-on motion | 0 when idle | all loops stop below settle threshold |
| Cold open transition start | < 16 ms after touch-down | lift-on-touch pre-render |

Rendering strategy on Android:

- Compose/Compose-Runtime for structure and state; `graphicsLayer` + `RenderNode` for transforms.
- Skia for path/text morphs (icon morphs, event card shapes).
- RenderThread for anything that must survive the main thread (e.g. jump-cut shot transitions).
- Vulkan/GL **only** for the boot sequence and the canvas zoom blur — never for everyday UI.
- Overdraw budget: max 1.6× average, measured on every screen; `debug.overdraw` must stay green.

## 11. Testing motion (implemented in `tools/`)

| # | Test | Where | What it asserts |
| --- | --- | --- | --- |
| 1 | Golden curves | `tools/spring-check.mjs` | For **every** profile × theme: overshoot ≤ 6.5 %, settle < 900 ms, Reduced Motion critically damped with 0 blur / no arcs / 4 % scale cap (109 assertions today) |
| 2 | Velocity budget | `tools/spring-check.mjs` | Release velocities from 400 → 8000 px/s never break the overshoot budget |
| 3 | Interrupt | `tools/spring-check.mjs` | Re-target at 15 %: single settle, no visual jump (`max step < 0.12`) |
| 4 | Gesture replay | `tools/experience-check.mjs` | Real pointer traces through jsdom: unlock, open morph, interactive back, CORE, FLOW, canvas, orb, drag & drop, split, sweep — plus the desktop/feature pack: shell flip, dock, `?` help, keyboard parity, DND quiet events, real editors, terminal, wheel zoom, window controls, pinning (134 assertions) |
| 5 | Motion lint | `tools/lint-motion.sh` | No hand-rolled rAF, no ad-hoc easing, no inline `transition`, nothing outside the engine |
| 6 | Surface lint | `tools/lint-classes.py` | Every class the JS builds exists in the stylesheets |
| 7 | Kotlin golden curves | `android/app/src/test` + `tools/check-motion-port.mjs` | The Kotlin port (`os.nova.motion`) reproduces the JS trajectories sample-for-sample (1e-9), the resolved springs for every profile × theme, the velocity budget, re-targeting, and every guard constant — plus the physics/engine suite (7 JUnit tests, `GoldenMain` without JUnit). CI runs `gradle testDebugUnitTest` before every APK. |
| 8 | Perf gate | `NovaMotion.stats` + the deck | FPS, live animation count, worst frame and overshoot are visible while using the system; on device this becomes a CI gate on the device lab |

```bash
npm install     # jsdom, for the experience check
npm run check   # motion lint + class lint + spring tests + port parity + experience check
npm run golden  # regenerate android/…/golden-curves.json after changing the JS engine
gradle -p android testDebugUnitTest   # replay the golden curves on the JVM (CI does this too)
```
