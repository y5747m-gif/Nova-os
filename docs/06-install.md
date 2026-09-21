# 06 — Install NOVA OS on a phone

> **ملخص عربي:** فيه طريقين حقيقيين لتشغيل NOVA على هاتف:
> **(1) تثبيت فوري كتطبيق ويب (PWA)** — بيدخل الشاشة الرئيسية ويفتح ملء الشاشة، من غير أي بناء.
> **(2) APK حقيقي** — قشرة Android أصلية (WebView) بتتولّد من نفس الكود ده على GitHub Actions،
> وبتنزل من صفحة Releases مباشرة (وزر «تحميل APK» جوه NOVA بيدوّر عليها أوتوماتيك).
> المستند ده فيه خطوات البناء المحلي، والبناء التلقائي، والتوقيع، والتحديث الذاتي، والحدود المعروفة.

## 1. Path A — install as an app right now (PWA)

Works on any phone, no build, no file transfer:

| Platform | Steps |
| --- | --- |
| **Android (Chrome / Edge)** | Open the NOVA URL → inside NOVA, tap **تحميل على الهاتف → ثبّت الآن** (or browser menu `⋮` → *Add to Home screen / Install app*). |
| **iPhone / iPad (Safari only)** | Open the URL in Safari → Share `⎋` → **Add to Home Screen**. |
| **Desktop** | Chrome/Edge address bar → install icon. |

What you get:

- Full-screen window (no browser chrome), portrait, `theme_color #07080B`.
- A real service worker: the app shell is cached, so it opens offline and updates itself
  (stale-while-revalidate for assets, network-first for the document).
- An icon and name on the home screen, plus manifest shortcuts for `NOVA CORE` and `NOVA CANVAS`.
- Version badge in the sheet; `U` applies a waiting update, or just reopen the app.

Limits: still a web app in a browser engine — no system notifications when closed, no default-home
replacement, no haptics beyond `navigator.vibrate`, no file-system level drag & drop.

## 2. Path B — the APK (Android 8.0 / API 26+)

`android/` is a small, real Android app: a full-screen `WebView` that serves the exact same web
experience from `assets/www` through `WebViewAssetLoader` (secure origin, no `file://`), plus the
native things a browser can't do:

| Native capability | Where |
| --- | --- |
| Edge-to-edge with real system-bar insets passed to CSS (`--nv-inset-top/bottom`) | `MainActivity.applyInsets()` |
| Hardware + gesture **Back** routed into NOVA's own navigation (`window.NovaBack`) | `MainActivity` back callback |
| Launcher entry (`CATEGORY_HOME`) so NOVA can be your home screen | `AndroidManifest.xml` |
| Adaptive launcher icon (foreground/background/monochrome) generated from the icon master | `tools/make-icons.sh` → `mipmap-anydpi-v26/` |
| Notification bridge (NOVA FLOW events → system notifications) + channels | `NovaNotify`, `NovaBridge.notify` |
| APK self-update: download to cache → `FileProvider` → system package installer | `NovaInstaller`, `NovaUpdateWorker` |
| Opt-in "start on boot" (off unless you turn it on) | `NovaPrefs.bootLaunch`, `NovaBootReceiver` |

### 2.1 Build it without a computer (GitHub Actions — recommended)

> **Already built once:** the workflow has run on this repository and published
> `nova-os-latest.apk` (verified: `os.nova.launcher`, versionName 0.1.0, minSdk 26/target 34,
> launchable `MainActivity`, 38 `assets/www` files inside, SHA-256 in the release notes).
> Open **Releases → NOVA OS — APK (latest)** on your phone and install it, or just tap
> **تحميل APK** inside NOVA — it resolves the same asset.

The repository ships a workflow: `.github/workflows/apk.yml`.

1. Push the repo to GitHub (already done if you're reading this in the repo).
2. **Actions → Build NOVA OS APK → Run workflow** (branch `main`). It also runs automatically on
   every push to `main` that touches `prototype/`, `android/` or `VERSION`.
3. The job runs the quality gates (`npm run check`), stages the web app into the APK, builds with
   Gradle 8.9 + AGP 8.5.2 + JDK 17, and publishes:
   - `nova-os-latest.apk` — what the in-app **تحميل APK** button looks for,
   - `nova-os-v<version>.apk` — a numbered copy you can always roll back to,
   - `SHA256SUMS.txt`.
4. On the phone: open the asset link → the APK downloads → tap it → allow *Install unknown apps*
   for the browser/files app → **Install**.

No keystore, no secrets, no third-party service: the CI uses the standard Android debug signature,
which is exactly right for a prototype you install by hand. (Play Store distribution is a later
phase and needs a real signing key — §6.)

### 2.2 Build it locally

Requirements: **JDK 17** and an Android SDK with **API 34 platform + build-tools**.
(The Android SDK is not part of this repo; Android Studio installs it for you.)

```bash
# 1. stage the web experience into the app's assets (also: npm run apk:assets)
bash tools/stage-assets.sh

# 2. build
cd android
gradle assembleDebug            # or: ./gradlew assembleDebug once a wrapper exists
#    with Android Studio: open the `android/` folder and press Run

# 3. the APK
ls app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Prefer the command line without Android Studio? Set the SDK path in `android/local.properties`:

```properties
sdk.dir=/path/to/Android/Sdk
```

### 2.3 Make NOVA the home screen (optional)

After installing: **Settings → Apps → Default apps → Home app → NOVA OS**.
Press Home — you land in NOVA's Dynamic Space. To leave it, pick another home app the same way;
NOVA never hijacks anything and never auto-starts unless you enable *boot launch*
(`NovaSystem.setBootLaunch(true)` from the app, or the debug bridge).

## 3. The download button inside NOVA

The deck has **Install on your phone** → *تحميل على الهاتف*. The sheet:

1. reads `https://api.github.com/repos/y5747m-gif/Nova-os/releases` (public, no token),
2. finds the first release asset ending in `.apk`,
3. shows its name and size,
4. downloads it — inside the APK it uses `NovaSystem.download()` (cache → `FileProvider` →
   system installer) and shows progress as a notification; in a browser it simply downloads the file,
5. if there is no published build yet, it explains how to run the workflow once — it never
   pretends a button works when it doesn't.

The update check runs in the background too: `NovaUpdateWorker` polls every 12h and posts **one**
notification per new tag (`NovaPrefs.seenUpdate` prevents nagging).

## 3.1 Preview the phone layout in a desktop browser

Append `?shell=app` to the URL (or `?shell=web` to force the deck back). That is the exact
full-screen layout the APK and an installed web app use: no device frame, no control deck,
safe-area padding driven by `--nv-inset-*` / `env(safe-area-inset-*)`.

## 4. Offline & caching

| Context | Behaviour |
| --- | --- |
| PWA | App shell cached by `sw.js`; documents are network-first with a cached fallback; cross-origin requests (fonts) are left to the browser. |
| APK | The experience *is* local: `assets/www` inside the APK. Only the update check and outbound links need the network. |
| Both | NOVA's workspace and settings live in WebView/localStorage — nothing is uploaded anywhere. |

## 5. Accessibility, permissions, privacy

- Permissions the APK declares: `INTERNET` (update check), `POST_NOTIFICATIONS` (FLOW events),
  `VIBRATE` (haptic set), `RECEIVE_BOOT_COMPLETED` (update check + opt-in boot launch),
  `REQUEST_INSTALL_PACKAGES` (installing its own update). Nothing else — no storage, no location,
  no camera, no contacts.
- The WebView is deliberately locked down: no file access, no content access, mixed content blocked,
  Safe Browsing on, algorithmic darkening off (NOVA has its own Dark/Paper), external links open in
  the real browser.
- Sensor/privacy surfaces inside the product follow `docs/01` §17 and `docs/05` §10.

## 6. Signing your own release build (optional)

### Why you want this

CI builds without a keystore are **debug-signed**, and a debug keystore is generated fresh on every
runner — so two builds from two runs carry *different* certificates. Android refuses to install a
package over one signed by a different key: you get “App not installed / conflict” and have to
uninstall first. Give the workflow one stable key and updates install **in place**, forever.

### Turn it on in CI (one time)

```bash
keytool -genkeypair -v -keystore nova-release.jks -alias nova -keyalg RSA \
        -keysize 4096 -validity 9125 -storetype JKS
base64 -w0 nova-release.jks > nova-release.jks.b64     # or: base64 -i … on macOS
```

Then in the repository: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `NOVA_KEYSTORE_BASE64` | contents of `nova-release.jks.b64` |
| `NOVA_STORE_PASSWORD` | the keystore password |
| `NOVA_KEY_ALIAS` | `nova` |
| `NOVA_KEY_PASSWORD` | the key password |

From the next run the workflow builds `assembleRelease` (R8 + resource shrinking, rules keep the JS
bridge), signs with your key, and says so in the release notes. Delete the keystore and password
files from the repository working tree — `.gitignore` keeps `*.jks` and `android/keystore.properties`
out of Git, and secrets never appear in logs.

### Or sign locally

```bash
keytool -genkeypair -v -keystore nova-release.jks -alias nova -keyalg RSA \
        -keysize 4096 -validity 9125 -storetype JKS
cat > android/keystore.properties <<'EOF'
storeFile=../nova-release.jks
storePassword=…
keyAlias=nova
keyPassword=…
EOF
cd android && gradle assembleRelease
```

With `android/keystore.properties` present, `app/build.gradle` signs the release build, enables
R8/ProGuard (rules keep the JS bridge) and shrinks resources. Keep the keystore and passwords out of
Git — `.gitignore` already excludes `android/keystore.properties` and `*.jks`.

## 7. Known limits of this build (set expectations honestly)

1. It is a **prototype shell**, not a ROM: NOVA runs full-screen as an app, it cannot repaint other
   apps' windows. Path A/B in `docs/03` §1 — the real system-level ownership is Phase 3.
2. Debug-signed APKs show a warning at install time and cannot be published to the Play Store.
3. Text zoom and system font scale are respected, but NOVA's own motion profile is chosen in-app
   (Settings → controls in the deck); OS-level "remove animations" is honoured through
   `prefers-reduced-motion`.
4. Notifications from other apps stay Android's; NOVA presents its *own* events as NOVA FLOW cards.
5. iOS has no APK path: use the PWA (§1). A real iOS app would be a separate SwiftUI effort.

## 8. Version bumping

One command keeps the three sources of truth aligned:

```bash
node tools/bump-version.mjs 0.2.0    # writes /VERSION, src/core/version.js, sw.js (new cache gen)
bash tools/stage-assets.sh           # re-stage for a local APK build
```

The Gradle `versionName` reads `/VERSION`, the CI names the APK `nova-os-v<version>.apk`, and the
in-app sheet shows the running version — so a released asset is always traceable to a commit.
