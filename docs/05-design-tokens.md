# 05 — Design Tokens

> **ملخص عربي:** كل الألوان والمسافات والحواف والظلال والأصوات والهزّات كـ توكنات، عشان
> النظام كله يبقى متسق. الوضع الداكن اسمه NOVA Dark، والفاتح NOVA Paper.

## 1. Color — NOVA Dark (default)

| Token | Value | Use |
| --- | --- | --- |
| `--nv-bg` | `#07080B` | Background / canvas void |
| `--nv-surface` | `#101218` | Cards, panels |
| `--nv-elevated` | `#171A22` | Raised windows, dialogs |
| `--nv-line` | `rgba(244,246,250,.08)` | Hairlines, dividers |
| `--nv-text` | `#F4F6FA` | Primary text |
| `--nv-text-2` | `#8C93A1` | Secondary text, metadata |
| `--nv-text-3` | `#5A6070` | Disabled, hints |
| `--nv-accent` | `#6C5CE7` | Primary accent (Nova Violet) |
| `--nv-accent-2` | `#22D3EE` | Secondary accent (Signal Cyan) |

## 2. Color — NOVA Paper (light)

| Token | Value |
| --- | --- |
| `--nv-bg` | `#F5F6F8` |
| `--nv-surface` | `#FFFFFF` |
| `--nv-elevated` | `#FFFFFF` |
| `--nv-text` | `#111318` |
| `--nv-text-2` | `#5B6273` |
| `--nv-accent` | `#5B4BE0` |

Light mode is not "same shadows, darker text": in Paper, **shadows get tighter and motion gets
*slightly* quicker** (×0.95) because contrast-based depth cues replace shadow-based ones.

## 3. Semantic accents

| Name | Value | Meaning in NOVA |
| --- | --- | --- |
| Bloom | `#FF6B9A` | People / communication events |
| Mint | `#34D399` | Success, confirmations |
| Amber | `#F5A524` | Attention, deferral, thermal chip |
| Coral | `#FF5C5C` | Error, destructive, revoke |
| Ice | `#7DD3FC` | Devices, transfers, files |

## 4. Typography

- Arabic: **IBM Plex Sans Arabic** (fallback: system Arabic). Latin: **Inter**.
- Numerals: Latin for time/percent (per `19:42`), Arabic-Indic only inside Arabic prose if the
  user opts in (Settings → NOVA → Numerals).
- Scale (dp / weight / tracking):

| Token | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 40 | 600 | -0.5 | Lock clock |
| `title` | 26 | 600 | -0.3 | Greeting, screen titles |
| `heading` | 19 | 600 | 0 | Card titles |
| `body` | 16 | 400 | 0 | Content |
| `label` | 14 | 500 | 0.1 | Buttons, chips |
| `caption` | 12 | 500 | 0.4 | Metadata, status |

## 5. Spacing, radii, strokes

```
space: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48
radius: chip 10 · card 22 · window 28 · panel 32 · orb 999
stroke: hairline 1 (line color) · focus 2 (accent) · motion trace 1.5
blur:   gated, ≤ 12 px, ≤ 2 live layers   (see 02-motion-language.md §10)
```

## 6. Elevation & shadow

| Level | Shadow | Notes |
| --- | --- | --- |
| `flat` | none | Background content |
| `card` | `0 4px 18px rgba(0,0,0,.35)` | Dark; in Paper: `0 2px 10px rgba(17,19,24,.08)` |
| `window` | `0 18px 50px rgba(0,0,0,.45)` | Floating world |
| `panel` | `0 24px 70px rgba(0,0,0,.55)` | CORE / FLOW / CONTROL |
| `dialog` | `0 30px 90px rgba(0,0,0,.6)` | + 45 % scrim below |

## 7. Accent packs (mixable with motion themes)

| Pack | Accent | Accent 2 |
| --- | --- | --- |
| Nova Violet *(default)* | `#6C5CE7` | `#22D3EE` |
| Aurora | `#4ADE80` | `#A78BFA` |
| Orbit | `#F5A524` | `#6C5CE7` |
| Liquid | `#22D3EE` | `#FF6B9A` |
| Neon | `#FF3D81` | `#00E5FF` |

## 8. Icon language

- 24 dp grid, 1.8 dp stroke, round caps, one continuous line where possible.
- Container is a geometric shape with deliberate inner negative space (not a filled square).
- Optical corrections at 16/20 dp; no two icons share a silhouette.
- Animated icon transitions use NOVA MOTION `FAST` + `SNAP` spring only.

## 9. Sound set (`NovaSound`)

| Event | Name | Character | Synth shape |
| --- | --- | --- | --- |
| Open app / card → space | `open` | soft pulse | sine 440→660 Hz, 90 ms, light low-pass, gentle attack |
| Close app | `close` | low fade | sine 330→220 Hz, 130 ms, long release |
| Success / drop accepted | `success` | double tone | two sines 660 + 880 Hz, 70 ms each, 60 ms gap |
| Error / refused | `error` | short descending | saw-ish 520→300 Hz, 110 ms, soft clip |
| Snap point (split/divider/slider) | `tick` | micro click | filtered noise 12 ms |
| Event arrives (orb) | *silent* | — | orb uses motion only; sound reserved for calls |
| Call | `call` | warm two-note loop | 520/780 Hz, 1.2 s cycle, max 3 cycles then haptics only |

## 10. Haptic set (`NovaHaptics`)

| Event | Waveform | Duration |
| --- | --- | --- |
| Open | light click, sharp attack | 8 ms |
| Close | soft thud, low frequency | 14 ms |
| Drag micro-tick | 1 tick per 8 dp | 3 ms |
| Snap arrival | stronger tick | 10 ms |
| Success | two pulses, 60 ms apart | 2 × 12 ms |
| Error | single rough pulse | 16 ms |
| Orb pull complete | rising double | 2 × 10 ms |

Rules: never vibrate during typing, during a call's audio, or when `Reduced Motion` + "quiet
haptics" is on; total haptic energy per minute is capped by `NovaHaptics.budget(60s)`.

## 11. Motion theme ↔ token pairing (recommended defaults)

| Motion theme | Accent pack | Profile default |
| --- | --- | --- |
| Aurora | Aurora | Balanced |
| Orbit | Orbit | Cinematic |
| Liquid | Liquid | Cinematic |
| Minimal | Nova Violet | Fast (with Reduced-Motion-friendly curves) |
| Neon | Neon | Balanced |
