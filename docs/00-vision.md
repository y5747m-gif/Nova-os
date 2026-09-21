# 00 — Vision

> **ملخص عربي:** الفكرة الأساسية إن المستخدم ميشعر إنه "بينقل بين تطبيقات منفصلة"،
> لكنه بيعبّر عن نية (نية = إرسال صورة، فتح مساحة شغل، رد على شخص) والنظام هو اللي
> يوصّل النية بالنتيجة. التطبيقات تبقى *قدرات* جوه النظام، مش جزر منفصلة ليها أبواب.
> وكل حاجة في النظام — الحركة، الصوت، الهزاز، العمق — بتتكلم نفس اللغة.

## 1. The shift

| | Android (as we know it) | NOVA OS |
| --- | --- | --- |
| Mental model | Apps → open → work inside → Back → Home | Spaces → cards → actions → transitions |
| Question the user answers | "Which app do I need?" | "What do I want to do?" |
| Primary object | The app icon | The **intent** and the **content** |
| Navigation | Full-screen swaps | Continuity: things move, they don't cut |
| Notifications | A list that interrupts | Event cards + a passive orb that waits |
| Recents | A vertical stack | A 2D workspace (NOVA CANVAS) with groups |
| Motion | Fade + slide + scale, per-app opinions | One system-wide language (NOVA MOTION) |
| Customization | Wallpaper + accent | **Motion themes** change behaviour, not just color |

The example that defines the whole product:

> You want to send a photo.
> **Android:** Gallery → select → Share → WhatsApp → pick contact.
> **NOVA:** the system already knows *"الصورة جاهزة للإرسال"* — you drag the photo toward the
> person, the app, the folder, or the nearby device. The target is the gesture, not a menu.

## 2. Non-negotiables

1. **Intent over apps.** Every surface must be reachable from the content, not from a launcher grid.
2. **Continuity.** Nothing appears out of nowhere. The thing you touched is the thing that grows.
3. **The finger owns the animation.** Progress is driven by the gesture, never queued behind it.
4. **Calm by default.** Nothing interrupts. Events wait at the edge until invited.
5. **One motion language.** Home, apps, SystemUI, and dialogs all speak NOVA MOTION.
6. **Reversible.** Any transition can be cancelled mid-flight and returns smoothly.
7. **Accessible.** Reduced Motion is a first-class profile, not a degradation.
8. **Fast or it doesn't exist.** If a beautiful effect costs frames, it gets cut, not shipped.
9. **Private by construction.** Local-first intelligence, visible sensor use, clear permission language.
10. **Honest hardware.** No fake depth that costs battery; effects must be earned.

## 3. Layer names (the vocabulary)

| Layer | Name | Responsibility |
| --- | --- | --- |
| System UI | **NOVA CORE** | Status, navigation, window surfaces, power, permissions UI |
| Motion | **NOVA MOTION** | Tokens, springs, gesture progress, depth, themes |
| Events | **NOVA FLOW** | Event cards, orb, priority, quiet states |
| Recents | **NOVA CANVAS** | 2D workspace, groups, memory spaces, resume |
| Search | **NOVA FIND** | Everything search: people, media, files, messages, actions, apps |
| Assistant | **NOVA INTELLIGENCE** | Local intent engine, workspace memory, suggestions |
| Controls | **NOVA CONTROL** | Radial control surface, connectivity, audio, power modes |
| Identity | **NOVA EXPERIENCE** | The umbrella brand for everything the user feels |

## 4. What NOVA is not

- It is **not** a reskin of Android with rounder corners.
- It is **not** a wall of widgets pretending to be a desktop.
- It is **not** an animation showcase — motion exists to explain spatial relationships.
- It does **not** invent incompatible Back handling; it builds on Android's predictive-back and
  shared-element infrastructure and gives them a different identity.
- It does **not** ship a chatbot and call it intelligence.

## 5. Success signals (what we measure)

| Signal | Target |
| --- | --- |
| Actions to send content to a person | ≤ 2 (drag + drop) |
| Mean frames dropped on open transition | 0 at 120 Hz, < 2 at 60 Hz |
| Time from intent to first meaningful frame | ≤ 120 ms perceived (transition starts on touch) |
| Users who keep the default motion profile | > 70 % (i.e. Cinematic isn't annoying) |
| Reduced Motion adoption among users who enable OS accessibility | 100 % respected everywhere |
| Notification interruption rate in media context | 0 banners; orb only |

## 6. Related documents

- Experience details → `01-experience-spec.md`
- Motion contract → `02-motion-language.md`
- Engineering shape → `03-architecture.md`
- Plan of attack → `04-roadmap.md`
- Visual/sonic tokens → `05-design-tokens.md`
