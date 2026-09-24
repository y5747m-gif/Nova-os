# 06 — Install NOVA OS on a phone

> **ملخص عربي:** فيه طريقين حقيقيين لتشغيل NOVA على هاتف:
> **(1) تثبيت فوري كتطبيق ويب (PWA)** — بيدخل الشاشة الرئيسية ويفتح ملء الشاشة، من غير أي بناء.
> **(2) APK حقيقي** — قشرة Android أصلية (WebView) بتتولّد من نفس الكود ده على GitHub Actions،
> وبتنزل من صفحة Releases مباشرة (وزر «تحميل APK» جوه NOVA بيدوّر عليها أوتوماتيك).
> المستند ده فيه خطوات البناء المحلي، والبناء التلقائي، والتوقيع، والتحديث الذاتي، والحدود المعروفة.

## 1. Path A — install as an app right now (PWA)

**The NOVA URL** — both hosts publish the same `prototype/` tree once configured. The canonical
values live in [`urls.json`](urls.json) (one place, machine-gated by `npm run check:deploy`);
if this list and that file ever disagree, the file is right and CI is red:

- <https://y5747m-gif.github.io/Nova-os/> — GitHub Pages, published by `.github/workflows/pages.yml`
  on every push that touches the prototype (the workflow runs the quality gates first; a broken
  prototype never deploys). After the deploy, the **shipping harness**
  (`tools/deploy-check.mjs --live`) fetches the site and asserts the pushed version is what
  answers — the deploy only counts when proven delivered. One-time repo setup: **Settings →
  Pages → Source = GitHub Actions** (if it is off, every deploy fails and the harness names the fix).
- **Vercel:** use the production domain in the
  [project dashboard](https://vercel.com/y5747m-gif/nova-os), not an old deployment URL.
  See [Vercel recovery](#vercel-recovery) if it returns 404 (or a login screen — a different
  failure with a different switch, and the table there tells them apart).

The repository root also carries a tiny `index.html` that forwards to `prototype/`, so hosting the
repo itself on any static host still lands in NOVA instead of a 404.

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

> **Already built and verified:** the workflow has run on this repository and published
> `nova-os-latest.apk` (~4.31 MB). The release notes carry a machine-generated report from
> `node tools/inspect-apk.mjs` proving the file is installable: package `os.nova.launcher`,
> versionName 0.1.0, minSdk 26 / target 34, launchable `MainActivity`, **signed with APK Signature
> Scheme v2** (see the note below), and 38 `assets/www` files (version 0.1.0) carrying the web app.
> Open **Releases → NOVA OS — APK (latest)** on your phone and install it, or just tap
> **تحميل APK** inside NOVA — it resolves the same asset.
>
> That report also prints the exact **size and SHA-256 of the file you are about to install**, and
> `SHA256SUMS.txt` / `VERIFIED.md` sit next to the APK. They are deliberately not copied into this
> document: every build re-signs the package, so two builds of identical code differ by a few bytes
> and their hashes differ with them. Read the hash from the release you downloaded, not from here —
> `sha256sum nova-os-latest.apk` must match the value in that release's notes.

> **About the signature:** these builds are signed with the standard Android *debug* key, so the
> report says "v2" and nothing else. That is a real, installable signature — Android accepts it as
> soon as you allow "install unknown apps". It is not *stable*, though: CI generates a new debug key
> per runner, so an in-place update over a previously installed build may be refused with
> «تعارض في التطبيق». Workarounds: uninstall the old build first, or add the four signing secrets
> from §6 so every build carries one permanent certificate.

The repository ships a workflow: `.github/workflows/apk.yml`.

1. Push the repo to GitHub (already done if you're reading this in the repo).
2. **Actions → Build NOVA OS APK → Run workflow** (branch `main`). It also runs automatically on
   every push to `main` that touches `prototype/`, `android/` or `VERSION`.
3. The job runs the quality gates (`npm run check`), stages the web app into the APK, builds with
   Gradle 8.9 + AGP 8.5.2 + JDK 17, and publishes:
   - `nova-os-latest.apk` — what the in-app **تحميل APK** button looks for,
   - `nova-os-v<version>.apk` — a numbered copy you can always roll back to,
   - `SHA256SUMS.txt` and `VERIFIED.md` (the inspector's own report, attached next to the file it
     describes).
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

# 2. build (testDebugUnitTest replays the NOVA MOTION golden curves first — CI does the same)
cd android
gradle testDebugUnitTest         # the Kotlin motion engine vs the JS reference
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

### 2.3 Make NOVA the home screen (one tap)

On first launch NOVA opens a **setup wizard** that walks through everything below —
or do it manually: **Settings → Apps → Default apps → Home app → NOVA OS**.
Press Home — you land in NOVA's Dynamic Space. To leave it, pick another home app the same way;
NOVA never hijacks anything and never auto-starts unless you enable *boot launch*.

### 2.4 Launcher permissions — what NOVA asks for and why

NOVA is a real launcher (`os.nova.launcher`): your installed apps, icons,
shortcuts, widgets and live notifications all work. Every grant is optional,
asked in context from the setup wizard, and deep-links to the exact system screen:

| Permission / access | System screen | Why NOVA wants it |
| --- | --- | --- |
| Default Home app (`ROLE_HOME` + `CATEGORY_HOME`) | system role dialog / Home settings | Home button opens NOVA; NOVA *is* the launcher |
| Installed apps (`QUERY_ALL_PACKAGES` + `<queries>`) | install-time | list + launch your apps with real icons in CORE and Dynamic Space |
| Notifications (`POST_NOTIFICATIONS`) | runtime dialog | NOVA's own update/event pings |
| Notification access (`BIND_NOTIFICATION_LISTENER`) | Notification-access settings | **NOVA FLOW**: live notifications mirrored as quiet cards |
| Usage access (`PACKAGE_USAGE_STATS`) | Usage-access settings | **NOVA INTELLIGENCE**: usage-ranked suggestions, on-device only |
| Contacts (`READ_CONTACTS`) | runtime dialog | **NOVA FIND → people**: search contacts, tap to call |
| Widgets (AppWidget host) | system picker + bind confirm | real system widgets on the NOVA canvas |
| Wallpaper (`SET_WALLPAPER*`, media read) | — / picker | optional: your own wallpaper behind NOVA's glass |
| Shortcuts (`INSTALL_SHORTCUT`) | install-time | deep shortcuts (long-press an app) |
| Self-update (`REQUEST_INSTALL_PACKAGES`) | installer | download + install NOVA's next APK in place |
| Boot (`RECEIVE_BOOT_COMPLETED`), vibration, audio-focus | install-time | update check, opt-in boot launch, haptics, media state |

Nothing leaves the device: usage stats and contacts are read only to rank and
search locally. Deny anything and NOVA keeps working with the demo layer.

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

- Permissions the APK declares: see §2.4 — the full launcher set (apps catalogue, Home role,
  notification-listener, usage stats, contacts, widgets, wallpaper, shortcuts, self-update).
  No camera, no microphone, no SMS, no call logs; location and Bluetooth are declared only for
  future context features and are never requested today.
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

## 7.1 Verify any APK yourself

```bash
node tools/inspect-apk.mjs nova-os-latest.apk          # human-readable
node tools/inspect-apk.mjs nova-os-latest.apk --json   # machine-readable
```

It parses the APK's own ZIP directory (no external tools needed): package/version from `aapt2`
when available, permissions, signing files, `classes*.dex`, and exactly which `assets/www` files
and version went inside — then fails loudly if anything essential is missing. CI runs the same
script before publishing and pastes the output into the release notes, so the notes describe the
file you are about to install rather than the file we hoped to build.

## 8. Version bumping

One command keeps the three sources of truth aligned:

```bash
node tools/bump-version.mjs 0.2.0    # writes /VERSION, src/core/version.js, sw.js (new cache gen)
bash tools/stage-assets.sh           # re-stage for a local APK build
```

The Gradle `versionName` reads `/VERSION`, the CI names the APK `nova-os-v<version>.apk`, and the
in-app sheet shows the running version — so a released asset is always traceable to a commit.


## Vercel recovery

*How to read a dead URL correctly — this heading is an anchor (`#vercel-recovery`) that
README and §1 link to, so keep the title itself stable.*

> **ملخص عربي:** خطأ `404 DEPLOYMENT_NOT_FOUND` معناه إن الدومتين (الـ host)
> **غير مربوط بأي deployment** عند Vercel — الطلب بيموت في الراوتر قبل ما يوصل
> لأي ملف في المستودع. مفيش سطر JavaScript ولا rewrite في `vercel.json` هيعمّل
> حاجة معاه: العلاج إنك تربط الدومتين الصح بالمشروع (ولأول مرة تكتبها في مكان واحد).

**The three 404s people confuse with each other.** They look identical in a browser
and have three different owners:

| What the edge answers | Who is talking | What it means | Where the fix lives |
| --- | --- | --- | --- |
| `404 DEPLOYMENT_NOT_FOUND` | Vercel's **router** | the hostname maps to no deployment at all | Vercel → Settings → Domains (an account setting) |
| `404 NOT_FOUND` | Vercel's **static server** | the host resolves, but that path has no file | Root Directory / `outputDirectory` in `vercel.json` |
| `401` + a login screen | **Deployment Protection** | the deployment exists and is hidden behind Vercel Authentication | Vercel → Settings → Deployment Protection |

`nova-os-topaz-rho.vercel.app` is in the **first** row: the router answered before your
project was consulted at all. An earlier revision of this section described the same event
as "a domain/access configuration issue" and mentioned a login wall in the same breath —
that was row three bleeding into row one, and it sent the repair toward settings that could
not have helped. **A retired domain has nothing to authenticate against; a login wall means
the opposite: the deployment is there and is hiding it from you.** The switch you turn is
different, so tell the two apart before you touch anything.

### What was verified on 2026-09-24

Every claim here is reproducible with `gh` from the repository — no Vercel token, no
dashboard, nothing to trust but the deploy records GitHub already holds:

```bash
# 1 · what GitHub thinks the site URL is
gh api repos/y5747m-gif/Nova-os --jq .homepage
#   → https://nova-os-topaz-rho.vercel.app        ← the dead link people keep clicking

# 2 · what Vercel actually published, per deploy
gh api "repos/y5747m-gif/Nova-os/deployments?per_page=12" --jq '.[].id' \
  | while read -r id; do
      gh api "repos/y5747m-gif/Nova-os/deployments/$id/statuses" \
        --jq '.[] | select(.state=="success") | "\(.environment_url)"' | head -1
    done
#   → https://nova-fi7oxujwh-y5747m-gif.vercel.app, nova-30qlbewf2-…, nova-3vb2tri97-…
#     every one of them is a PER-DEPLOYMENT host, none is a project alias
```

That second block is the whole diagnosis. Since 2026-09-22 every Vercel deploy of this
project finished **successfully** and got a hostname of the shape
`nova-<id>-y5747m-gif.vercel.app`. The app has been built and served the entire time;
what is missing is a *name that outlives a deployment*. `nova-os-topaz-rho` was a name of
a single old deployment (Vercel's older `<project>-<word>-<word>.vercel.app` minting
scheme); when that deployment went away — removed, or gone with a deleted/recreated
project — its hostname stopped resolving, and it will not resolve again until a human
attaches a domain. GitHub Pages, the other host documented in §1, is not enabled at all
(`has_pages: false`, and `pages.yml` fails in ~10 s at the self-heal step). So the site
currently has no durable public address, which is why the dead one keeps getting clicked.

### Repair (once, by an account owner — none of it is code)

1. **Pick the durable address.** Open the Vercel project [nova-os](https://vercel.com/y5747m-gif/nova-os)
   → **Settings → Domains**. Whatever is listed there for *Production* is the real URL.
   If nothing is: add a domain (own domain, or accept the `<project>-<team>.vercel.app`
   production alias Vercel offers). Never adopt a `<project>-<random>-<team>.vercel.app`
   URL printed by a deploy — that one belongs to one deployment and dies with it.
2. **Confirm the build settings** in **Settings → Build and Deployment**: Root Directory =
   repository root, framework **Other**, no build command, Output Directory **prototype**.
   The checked-in `vercel.json` declares the same, and `npm run check:deploy` fails the
   build if the two ever disagree.
3. **Make Production public**: Settings → **Deployment Protection** → off for Production
   (leave it on for Previews). Test in a private window; a signed-in check proves nothing.
4. **Publish the durable URL everywhere it is consumed**, and only that one. This is not
   cosmetic: the shipping harness reads the Website field back from GitHub and the deploy job
   goes **red** until it matches a URL in `docs/urls.json` — that is the point, because that
   field is the one copy of the address that a doc fix can never reach:
   ```bash
   gh api -X PATCH repos/y5747m-gif/Nova-os -f homepage="https://THE-PRODUCTION-DOMAIN/"
   # then put the same string in docs/urls.json → production.vercel
   ```
   A repo Website field and a README that disagree with the registry is how this incident
   started: the files were fixed in PR #2 and #13, the GitHub field was not.
5. **GitHub Pages (§1) is the zero-token fallback** and needs a repo admin once:
   **Settings → Pages → Source: GitHub Actions**. Then a push touching `prototype/**`
   publishes it, and the workflow's final step proves the deploy instead of assuming it.
6. **Prove it**, from a machine that is not signed into Vercel:
   ```bash
   npm run check:deploy:live -- --site https://THE-PRODUCTION-DOMAIN/
   node tools/deploy-check.mjs --discover          # what the deploy records really say
   ```
   `/`, `/sw.js` and `/manifest.webmanifest` must all answer 200, and `/sw.js` must carry
   the version in `VERSION`. If the harness prints `VERDICT [host-unattached]`, stop: no
   rewrite or code change can help, the host is still pointing at nothing.

Never put a Vercel token in this repository. Nothing above needs one — `gh api` reads
the deployment statuses the Vercel GitHub App already writes.

### Why this cannot rot again

- **`docs/urls.json` is the only place a public NOVA URL is allowed to live.** The local
  gate reads it and rejects any `.vercel.app` / `.github.io` host advertised in
  `README.md` or `docs/*.md` that is not declared there — so a per-deployment URL can be
  pasted into a doc at most until the next `npm run check`, which CI runs before every
  deploy of both the site and the APK. Hosts listed under `retired` may appear only in
  this section, which is the prose whose job is to explain the corpse.
- **The live gate proves the other host too.** After deploying one host,
  `--live` probes the *other* declared production URL once and classifies the answer, and
  it asks GitHub what the repository's Website field says and whether that page really
  serves NOVA. An address outside the repo finally has a check inside the repo.
- **Retries stop when retrying is pointless.** Propagation deserves 4 minutes of
  patience; `DEPLOYMENT_NOT_FOUND` gets one look and a verdict, because waiting never
  re-attaches a domain.
- **Installed PWAs no longer inherit the outage.** `prototype/sw.js` treats a non-2xx
  navigation response as "the network did not answer" and serves the cached shell, so a
  home-screen NOVA opened during a host move shows NOVA instead of the platform's 404,
  and the error page never gets written into the shell cache.
