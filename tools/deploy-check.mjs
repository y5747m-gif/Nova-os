#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   NOVA shipping harness — "the delivery pipeline is a tool too"

   Harness-engineering wrapper around the whole way NOVA reaches a
   phone. It does three jobs:

   1. LOCAL (default, hermetic — no network, safe for every commit):
      proves prototype/ is deployable exactly as GitHub Pages will
      serve it: every referenced file exists, the manifest is valid
      and relative-pathed, the service worker precaches the full
      module graph, the two workflows still contain their contract,
      and the three version sources agree.

   2. LIVE (--live): proves the pipeline actually delivered:
        · GitHub Pages is enabled for this repo with Actions as the
          build source (the silent failure this harness exists for),
        · the deployed site answers 200 and serves the version this
          tree says it should (retried — Pages propagates slowly),
        · the APK release asset the in-app «تحميل على الهاتف» button
          downloads is really reachable.

   3. ADDRESSES (local + live): the URLs people type are treated as part of
      the product. docs/urls.json declares the durable production hosts;
      every host advertised in README/docs must be one of them, and a host
      Vercel minted for a single deployment — which is the kind that 404s
      with DEPLOYMENT_NOT_FOUND once its deployment is gone — is refused by
      shape, not by blocklist. --live then proves each declared host, and
      asks GitHub whether the repository's own Website field still serves
      NOVA. Dead links rot outside the repo, so the check lives inside it.

   4. SELFTEST (--selftest): the harness tests itself. It corrupts a
      scratch copy of prototype/ six different ways and asserts its
      own local checks turn RED on every corruption and stay GREEN on
      the clean copy. A harness that cannot fail is a rubber stamp.

   usage:
     node tools/deploy-check.mjs                  # local gate
     node tools/deploy-check.mjs --live           # after a deploy (CI + manual)
     node tools/deploy-check.mjs --live --site https://me.github.io/repo/
     node tools/deploy-check.mjs --discover       # what the deploy records really published
     node tools/deploy-check.mjs --selftest       # red/green proof

   exit codes: 0 = every check green · 1 = at least one failure ·
               2 = bad usage. Live checks that need a token but find
               none degrade to SKIP, never to failure.
   ══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* ── arguments ────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const LIVE = flag('--live');
const SELFTEST = flag('--selftest');
const DISCOVER = flag('--discover');

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ROOT = path.resolve(opt('--root', REPO_ROOT));        // --root is for the selftest
const PROTO = path.join(ROOT, 'prototype');

const RETRIES = Number(opt('--retries', '24'));             // 24 × 10 s ≈ 4 min of Pages propagation
const WAIT_MS = Number(opt('--wait-ms', '10000'));

/* ── tiny harness core ────────────────────────────────────────── */
let passed = 0;
let failed = 0;
let skipped = 0;
const findings = [];

function ok(name, extra = '') {
  passed += 1;
  console.log(`PASS  ${name}${extra ? ` — ${extra}` : ''}`);
}
function bad(name, extra = '') {
  failed += 1;
  findings.push(`${name}${extra ? ` — ${extra}` : ''}`);
  console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
}
function skip(name, extra = '') {
  skipped += 1;
  console.log(`SKIP  ${name}${extra ? ` — ${extra}` : ''}`);
}
function check(name, cond, extra = '') {
  cond ? ok(name, extra) : bad(name, extra);
  return !!cond;
}

/* ── helpers ──────────────────────────────────────────────────── */
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (m) return m[1];
  } catch { /* no git here — fall through */ }
  return opt('--repo', 'y5747m-gif/Nova-os');
}
const REPO = repoSlug();
const DEFAULT_SITE = `https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/`;
const SITE = (opt('--site', DEFAULT_SITE)).endsWith('/') ? opt('--site', DEFAULT_SITE) : `${opt('--site', DEFAULT_SITE)}/`;

const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;

/* ── the URL registry (docs/urls.json) ────────────────────────── */
const registryCache = new Map();
function urlRegistry(root = ROOT) {
  if (registryCache.has(root)) return registryCache.get(root);
  const file = path.join(root, 'docs/urls.json');
  const loaded = !exists(file) ? null : (() => {
    try {
      const raw = JSON.parse(read(file));
      return { production: raw.production ?? {}, retired: raw.retired ?? {}, file };
    } catch (e) { return { __error: e.message, file }; }
  })();
  registryCache.set(root, loaded);
  return loaded;
}

/* Which kind of address is this host? Vercel mints three flavours and only two
   of them are durable. `nova-os-topaz-rho.vercel.app` and
   `nova-fi7oxujwh-y5747m-gif.vercel.app` are both URLs of ONE deployment:
   they resolve while that deployment exists and 404 DEPLOYMENT_NOT_FOUND
   forever after it is removed. The project's production domain is the address
   that survives a redeploy, so anything else is a bookmark of a wave. */
function hostKind(host) {
  if (!/\.vercel\.app$/.test(host)) return { kind: host.endsWith('.github.io') ? 'pages' : 'custom', host };
  const label = host.replace(/\.vercel\.app$/, '').toLowerCase();
  const owner = (REPO.split('/')[0] || '').toLowerCase();
  const repoName = (REPO.split('/')[1] || '').toLowerCase();
  // the durable labels are "<project>" and "<project>-<team>"; a repo whose Vercel
  // project is spelled differently declares its own in docs/urls.json rather than
  // teaching this tool about one repository
  const extra = (urlRegistry()?.production?.durableLabels || []).map((x) => String(x).toLowerCase());
  const durable = new Set([repoName, `${repoName}-${owner}`, ...extra]);
  if (durable.has(label)) return { kind: 'alias', host, label };
  return { kind: 'deployment', host, label };
}

const DEAD_HOST_WHY = 'a Vercel URL generated for ONE deployment, not the project alias — '
  + 'it stops resolving the moment that deployment is deleted or expires, and no vercel.json '
  + 'rewrite can bring it back (the request never reaches your files). '
  + 'Use the production domain listed in Vercel → Settings → Domains, and record it in docs/urls.json.';

/* Turning Vercel's edge error bodies into a sentence about what to touch.
   Each class has a different owner: some are account settings, some are config,
   and none of them are application JavaScript. */
function diagnoseSite(url, res, version) {
  // status 0 = the socket, not the server: no TLS/no route/no egress. Report it as a
  // limit of wherever the harness is running, never as a verdict about the site.
  if (!res || res.status === 0) {
    return { cls: 'unreachable', msg: `no answer from ${url} — this machine could not open a connection to it `
      + '(DNS/TLS/egress). The harness is reporting on itself, not on the deployment.' };
  }
  const body = res.body || '';
  const status = res.status;
  if (status === 404 && /DEPLOYMENT_NOT_FOUND/i.test(body)) {
    return { cls: 'host-unattached', fatal: true, msg: `${new URL(url).hostname} is attached to NO deployment on Vercel `
      + `(404 DEPLOYMENT_NOT_FOUND comes from the edge router, before any project config is read). `
      + DEAD_HOST_WHY };
  }
  if (status === 404 && /NOT_FOUND|does not have a static file|deployment.{0,40}(not found|does not exist)/i.test(body)) {
    return { cls: 'wrong-output', msg: `the host resolves but ${new URL(url).pathname} has no file in it (404 NOT_FOUND): `
      + 'the deployment serves a directory that is not prototype/ — check Vercel Root Directory and outputDirectory' };
  }
  if (status === 401 || status === 403 || /AUTH_REQUIRED|Deployment Protection|Vercel Authentication|log in to (view|access)/i.test(body)) {
    return { cls: 'login-gated', msg: `HTTP ${status} with a Vercel login wall: Deployment Protection is on for this `
      + 'deployment class. A public PWA host must be open for Production — Vercel → Settings → '
      + 'Deployment Protection → leave Production unprotected (or add a bypass), then re-test signed out' };
  }
  if (status === 402 || /PAUSED|exceeded your|usage exceeded/i.test(body)) {
    return { cls: 'paused', msg: `HTTP ${status}: Vercel paused the deployment (billing/usage). `
      + 'Nothing in the repo can fix this — settle it in Vercel → Settings → Usage' };
  }
  if (status >= 500) return { cls: 'edge-5xx', msg: `Vercel edge answered HTTP ${status} — retry; if it persists, the deployment build is broken (check its runtime logs)` };
  if (status >= 300 && status < 400) return { cls: 'redirect-loop', msg: `HTTP ${status} from ${url} after following redirects — the site never answered (a redirect to a login or a moved host)` };
  if (status === 200 && /http-equiv="refresh"[^>]*url=prototype\/?/i.test(body)) {
    return { cls: 'wrong-output', msg: 'the repository-root redirect fallback was served instead of NOVA: the deployment is '
      + 'publishing the repo root, not prototype/ — outputDirectory is not being applied' };
  }
  if (status === 200) return { cls: 'wrong-version', msg: `HTTP 200 but not NOVA ${version} at ${url} — the deploy that answered is `
      + 'not the one this tree describes (a stale alias, a cache, or a different project behind the host)' };
  return { cls: `http-${status}`, msg: `unexpected HTTP ${status} from ${url}` };
}

/* Network with a fallback ladder: node fetch → curl / gh CLI.
   Corporate proxies and sandboxed TLS stores break one or the other;
   a shipping harness must not die on the messenger. */
function curlGet(url, { range = false, timeout = 25 } = {}) {
  try {
    const args = ['-sS', '-L', '--max-time', String(timeout), '-w', '\n__NOVA_STATUS__%{http_code}', url];
    if (range) args.splice(1, 0, '-r', '0-0');
    const res = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (res.error) return null;
    const m = (res.stdout || '').match(/\n__NOVA_STATUS__(\d+)$/);
    if (!m) return null;
    return { status: Number(m[1]), body: res.stdout.slice(0, m.index) };
  } catch { return null; }
}

async function httpGet(url, opts = {}) {
  try {
    const headers = opts.range ? { range: 'bytes=0-0' } : {};
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow', headers });
    return { status: res.status, body: await res.text(), via: 'fetch' };
  } catch {
    const c = curlGet(url, opts);
    return c ? { ...c, via: 'curl' } : null;
  }
}

async function ghApi(pathname) {
  if (!ghToken) return null;
  try {
    const res = await fetch(`https://api.github.com${pathname}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${ghToken}`,
        'user-agent': 'nova-deploy-check',
      },
    });
    if (!res.ok) return { __status: res.status };
    return res.json();
  } catch {
    try {
      return JSON.parse(execFileSync('gh', ['api', pathname], { encoding: 'utf8' }));
    } catch (e) {
      const msg = `${e.stderr || ''}${e.stdout || ''}`;
      return { __status: /404/.test(msg) ? 404 : 0 };
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════
   LOCAL — hermetic deployability of prototype/
   ══════════════════════════════════════════════════════════════ */
function localChecks() {
  console.log(`\n── local · is ${path.relative(ROOT, PROTO) || 'prototype/'} deployable as-is? ──`);

  if (!check('prototype/ exists', exists(path.join(PROTO, 'index.html')))) return;

  /* 1 · every local file index.html points at is on disk */
  const html = read(path.join(PROTO, 'index.html'));
  const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^(?:https?:)?\/\//.test(u) && !u.startsWith('data:') && !u.startsWith('#'));
  const missingRefs = refs.filter((u) => !exists(path.join(PROTO, u.split('?')[0])));
  check(`index.html: all ${refs.length} local references resolve`, missingRefs.length === 0,
    missingRefs.length ? `missing: ${missingRefs.join(', ')}` : '');

  /* 2 · manifest: valid JSON, relative URLs (survives any base path), icons on disk */
  let manifest = null;
  try {
    manifest = JSON.parse(read(path.join(PROTO, 'manifest.webmanifest')));
    ok('manifest.webmanifest parses as JSON');
  } catch (e) {
    bad('manifest.webmanifest parses as JSON', e.message);
  }
  if (manifest) {
    const abs = ['start_url', 'scope'].filter((k) => typeof manifest[k] === 'string' && /^(?:https?:|\/)/.test(manifest[k]));
    check('manifest start_url/scope are relative (any base path works)', abs.length === 0,
      abs.length ? `absolute: ${abs.join(', ')}` : '');
    const iconMissing = (manifest.icons || []).filter((i) => !exists(path.join(PROTO, i.src)));
    check(`manifest icons exist (${(manifest.icons || []).length})`, iconMissing.length === 0,
      iconMissing.length ? `missing: ${iconMissing.map((i) => i.src).join(', ')}` : '');
  }

  /* 3 · the service worker precaches everything the app loads */
  const swSrc = read(path.join(PROTO, 'sw.js'));
  const shell = [...swSrc.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  const shellMissing = shell.filter((u) => !exists(path.join(PROTO, u)));
  check(`sw.js precache entries exist on disk (${shell.length})`, shellMissing.length === 0,
    shellMissing.length ? `missing: ${shellMissing.join(', ')}` : '');

  // the offline shell is the only thing standing between a phone and a
  // platform error page, so its contract is enforced here, not by hope:
  // a non-2xx navigation must fall through to the cache, and nothing may be
  // written into the shell cache without an ok response.
  check('sw.js treats a failed navigation as offline, not as a page to show',
    /if\s*\(!fresh\.ok\)\s*throw/.test(swSrc) && /await\s+cache\.put\('\.\/index\.html'/.test(swSrc),
    'a 404/500 from the host must never replace the cached shell');

  // walk the static import graph from index.html's entry module
  const seen = new Set();
  const walk = (rel) => {
    const abs = path.join(PROTO, rel);
    if (seen.has(rel) || !exists(abs)) return;
    seen.add(rel);
    const src = read(abs);
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    }
  };
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (!/^(?:https?:)?\/\//.test(m[1])) walk(m[1]);
  }
  const modules = [...seen];
  const uncached = modules.filter((m) => !shell.includes(m));
  check(`sw.js precaches the whole module graph (${modules.length} modules)`, uncached.length === 0,
    uncached.length ? `not cached: ${uncached.join(', ')}` : 'offline shell is complete');
  const strayCss = fs.readdirSync(path.join(PROTO, 'styles')).filter((f) => f.endsWith('.css') && !shell.includes(`styles/${f}`));
  check('every stylesheet is precached', strayCss.length === 0,
    strayCss.length ? `not cached: ${strayCss.join(', ')}` : '');

  /* 4 · version consistency across the three sources of truth */
  const version = read(path.join(ROOT, 'VERSION')).trim();
  const versionJs = read(path.join(PROTO, 'src/core/version.js'));
  check('version.js matches VERSION', versionJs.includes(`NOVA_VERSION = '${version}'`), version);
  check('sw.js matches VERSION', swSrc.includes(`NOVA_VERSION = '${version}'`), version);

  /* Vercel must publish the actual app, not the repository redirect page. */
  try {
    const config = JSON.parse(read(path.join(ROOT, 'vercel.json')));
    check('Vercel publishes prototype/ without a framework build',
      config.outputDirectory === 'prototype' && config.framework === null && config.buildCommand === '');
  } catch (e) {
    bad('Vercel configuration is valid JSON', e.message);
  }

  /* 4b · the URLs other people type. A documented address that quietly rots is
        worse than a missing feature, because the reader trusts it: this is how a
        dead deployment host ends up in a phone's PWA launcher. So the repo keeps
        one registry (docs/urls.json) and every advertised host is checked
        against it — including the shape of the host itself. */
  const urls = urlRegistry();
  if (!urls) {
    skip('docs/urls.json declares the public NOVA URLs', 'file is absent — advertised hosts go unchecked');
  } else if (urls.__error) {
    bad('docs/urls.json parses as JSON', urls.__error);
  } else {
    ok('docs/urls.json parses as JSON');
    const pages = (urls.production.githubPages || '').trim();
    // compared to the URL THIS repo's slug implies — not to --site, which is whatever
    // the operator happened to deploy (a local server, a Vercel alias, …)
    check('the declared GitHub Pages URL is this repo\'s Pages site', pages === DEFAULT_SITE || pages === '',
      pages === '' ? 'not declared' : pages);
    const vercel = (urls.production.vercel || '').trim();
    if (!vercel) {
      skip('the declared Vercel URL is the project production domain',
        'docs/urls.json production.vercel is empty — fill it from Vercel → Settings → Domains once a domain is attached');
    } else {
      const vk = hostKind(new URL(vercel).hostname);
      check('the declared Vercel URL is a durable production domain (not a per-deployment URL)',
        vk.kind !== 'deployment' && /^https:\/\//.test(vercel) && vercel.endsWith('/'),
        `${vercel} → ${vk.kind}`);
    }
    const retired = Object.keys(urls.retired || {});
    for (const r of retired) {
      if (!urls.retired[r] || !String(urls.retired[r]).trim()) bad('a retired URL explains why it died', r);
    }
    if (retired.length) ok(`retired URLs are documented with a reason (${retired.length})`);

    const declared = new Set([pages, vercel].filter(Boolean).map((u) => u.replace(/\/$/, '') + '/'));
    const offenders = [];
    const deadAdvert = [];
    for (const rel of ['README.md', ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)]) {
      const file = path.join(ROOT, rel);
      if (!exists(file)) continue;
      const text = read(file);
      const recoveryAt = rel === 'docs/06-install.md' ? text.search(/^##+ .*Vercel recovery/im) : -1;
      const recoveryLine = recoveryAt >= 0 ? text.slice(0, recoveryAt).split('\n').length - 1 : Infinity;
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/https?:\/\/[a-z0-9.-]+?\.(?:vercel\.app|github\.io)[a-z0-9._~:/?#@!$&'()*+,;=%-]*/gi)) {
          const url = m[0].replace(/[).,;:*_\]>]+$/, '');
          if (declared.has(url.replace(/\/$/, '') + '/')) continue;
          if (i >= recoveryLine) continue;                 // the repair section may name the corpse it is repairing
          const host = url.replace(/^https?:\/\//, '').split('/')[0];
          const kind = hostKind(host);
          const isRetired = retired.some((r) => new URL(r).hostname === host);
          if (kind.kind === 'deployment' || isRetired || kind.kind === 'pages') {
            const tag = isRetired ? 'retired' : kind.kind === 'deployment' ? 'deployment-scoped' : 'not declared in docs/urls.json';
            offenders.push(`${rel}:${i + 1} ${url} (${tag})`);
            if (kind.kind === 'deployment' || isRetired) deadAdvert.push(`${rel}: ${url} is ${tag} — ${DEAD_HOST_WHY}`);
          }
        }
      });
    }
    check('every advertised host is a durable address declared in docs/urls.json', offenders.length === 0,
      offenders.slice(0, 5).join(' · ') || `${declared.size} declared URL(s), no per-deployment links`);
    deadAdvert.forEach((f) => findings.push(f));
  }

  /* 5 · the workflow contract (the pipeline must keep its promises) */
  const pagesYml = read(path.join(ROOT, '.github/workflows/pages.yml'));
  const apkYml = read(path.join(ROOT, '.github/workflows/apk.yml'));
  check('pages.yml: quality gates run before the upload', /npm run check[\s\S]*upload-pages-artifact/.test(pagesYml));
  check('pages.yml: uploads prototype/ as the site', /upload-pages-artifact[\s\S]*?path:\s*prototype/.test(pagesYml));
  check('pages.yml: deploys with actions/deploy-pages', /actions\/deploy-pages@/.test(pagesYml));
  check('pages.yml: never interrupts a deployment in flight', /cancel-in-progress:\s*false/.test(pagesYml));
  check('apk.yml: quality gates run before the build', /npm run check[\s\S]*gradle/.test(apkYml));
  check('apk.yml: the APK is inspected before release', /inspect-apk\.mjs/.test(apkYml));
}

/* ══════════════════════════════════════════════════════════════
   LIVE — the pipeline actually delivered
   ══════════════════════════════════════════════════════════════ */
async function liveChecks() {
  console.log(`\n── live · did the pipeline really deliver ${REPO}? ──`);
  const version = read(path.join(ROOT, 'VERSION')).trim();

  /* 1 · GitHub Pages must be switched on with Actions as its source —
        the silent misconfiguration that makes every deploy fail. */
  const isPages = new URL(SITE).hostname.endsWith('.github.io');
  const pages = isPages ? await ghApi(`/repos/${REPO}/pages`) : null;
  if (!isPages) {
    skip('GitHub Pages configuration (target is another host)');
  } else if (pages === null) {
    skip('GitHub Pages is enabled (needs GH_TOKEN/GITHUB_TOKEN to verify)');
  } else if (pages.__status === 404) {
    bad('GitHub Pages is enabled',
      `repo ${REPO} has no Pages site — enable it: gh api -X POST repos/${REPO}/pages -f build_type=workflow`);
  } else {
    const source = pages.build_type ?? pages.source ?? 'unknown';
    const isWorkflow = source === 'workflow' || JSON.stringify(source).includes('workflow');
    check('GitHub Pages is enabled and built by Actions', isWorkflow, `source: ${JSON.stringify(source)}`);
  }

  /* 2 · the deployed site answers, and it answers with THIS version */
  const bust = `?nova-hc=${Date.now()}`;   // cache-bust: Pages edge caches aggressively
  let siteOk = false;
  let body = '';
  let lastDiag = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const res = await httpGet(SITE + bust);
    if (res && res.status === 200 && res.body.includes('<title>NOVA OS')) { siteOk = true; body = res.body; break; }
    lastDiag = diagnoseSite(SITE + bust, res, version);
    // waiting is the right medicine for propagation and the wrong one for a host
    // that is attached to nothing: that never heals, so do not burn 4 minutes on it
    if (lastDiag.fatal) { console.log(`      ${lastDiag.cls} — not retrying (a dead host stays dead)`); break; }
    console.log(`      attempt ${attempt}/${RETRIES}: ${res ? `HTTP ${res.status}` : 'no response'} — propagating…`);
    if (attempt < RETRIES) await sleep(WAIT_MS);
  }
  if (!check('the deployed site serves NOVA (200 + title)', siteOk, SITE)) {
    if (lastDiag) console.log(`\n  VERDICT [${lastDiag.cls}]\n    ${lastDiag.msg}\n`);
    return;
  }
  void body;

  const swRes = await httpGet(`${SITE}sw.js${bust}`);
  check('deployed sw.js answers 200', !!swRes && swRes.status === 200, swRes ? `HTTP ${swRes.status}` : 'no response');
  check('deployed sw.js is THIS version (what was pushed is what is live)',
    !!swRes && swRes.body.includes(`NOVA_VERSION = '${version}'`), `expected ${version}`);

  const manRes = await httpGet(`${SITE}manifest.webmanifest${bust}`);
  let manOk = !!manRes && manRes.status === 200;
  if (manOk) { try { JSON.parse(manRes.body); } catch { manOk = false; } }
  check('deployed manifest.webmanifest answers 200 + valid JSON', manOk, manRes ? `HTTP ${manRes.status}` : 'no response');

  /* 3 · the OTHER declared host, proven once. CI deploys one host per run, but the
        repo advertises two — and the whole class of bug this harness exists for is
        the second one quietly dying while the first stays green. */
  const urls = urlRegistry();
  const declared = [
    ['GitHub Pages', urls?.production?.githubPages],
    ['Vercel production', urls?.production?.vercel],
  ].filter(([name, u]) => u && !u.startsWith(SITE) && !/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u));
  if (!urls) skip('the second declared host answers (no docs/urls.json)');
  else if (!declared.length) skip('the second declared host answers (only one host is declared)');
  for (const [name, url] of declared) {
    const base = url.replace(/\?.*$/, '');
    const res = await httpGet(`${base}${base.includes('?') ? '&' : '?'}nova-hc=${Date.now()}`);
    const verdict = res && res.status === 200 && /<title>NOVA OS/.test(res.body || '')
      ? { cls: 'live', msg: `HTTP 200 serving NOVA via ${res.via}` }
      : diagnoseSite(url, res, version);
    if (verdict.cls === 'unreachable') skip(`${name} host answers with NOVA: ${url}`, 'no route from here — run this where the site is reachable');
    else check(`${name} host answers with NOVA: ${url}`, verdict.cls === 'live', verdict.cls === 'live' ? '' : `[${verdict.cls}] ${verdict.msg}`);
  }

  /* 4 · the GitHub "About → Website" field is the most-clicked NOVA link in the
        world for this repo, and it lives outside the repo — so nothing in a
        normal review ever notices when it rots. Ask GitHub directly. */
  if (!ghToken) {
    skip('the repository Website field points at a live NOVA host (needs GH_TOKEN)');
  } else {
    const meta = await ghApi(`/repos/${REPO}`);
    const homepage = (meta?.homepage || '').trim();
    if (!homepage) skip('the repository Website field points at a live NOVA host', 'no website set');
    else {
      const durable = [urls?.production?.githubPages, urls?.production?.vercel].filter(Boolean)
        .some((u) => homepage.replace(/\/$/, '') === u.replace(/\/$/, ''));
      const res = await httpGet(homepage);
      const verdict = res && res.status === 200 && /<title>NOVA OS/.test(res.body || '')
        ? { cls: 'live' } : diagnoseSite(homepage, res, version);
      if (verdict.cls === 'unreachable') skip('the repository Website field serves NOVA', 'no route from here');
      else check('the repository Website field serves NOVA', verdict.cls === 'live',
        verdict.cls === 'live' ? homepage : `[${verdict.cls}] ${verdict.msg}`);
      check('the repository Website field is a host declared in docs/urls.json', durable,
        durable ? homepage : `${homepage} — update it: gh api -X PATCH repos/${REPO} -f homepage="<the URL from docs/urls.json>"`);
    }
  }

  /* 5 · the APK the install sheet downloads is really there */
  const apkRes = await httpGet(`https://github.com/${REPO}/releases/download/apk-latest/nova-os-latest.apk`, { range: true });
  check('release asset nova-os-latest.apk is downloadable',
    !!apkRes && (apkRes.status === 206 || apkRes.status === 200),
    apkRes ? `HTTP ${apkRes.status}` : 'no response');
}

/* ══════════════════════════════════════════════════════════════
   SELFTEST — the harness proves it can fail
   ══════════════════════════════════════════════════════════════ */
async function selftest() {
  console.log('\n── selftest · corrupt → RED, clean → GREEN ──');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-harness-'));
  const scratch = path.join(tmp, 'prototype');
  fs.cpSync(PROTO, scratch, { recursive: true });
  // the scratch tree needs the files outside prototype/ the local gate reads
  fs.cpSync(path.join(REPO_ROOT, 'VERSION'), path.join(tmp, 'VERSION'));
  fs.cpSync(path.join(REPO_ROOT, 'vercel.json'), path.join(tmp, 'vercel.json'));
  fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'docs/urls.json'), path.join(tmp, 'docs/urls.json'));
  fs.cpSync(path.join(REPO_ROOT, 'README.md'), path.join(tmp, 'README.md'));
  fs.mkdirSync(path.join(tmp, '.github/workflows'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, '.github/workflows/pages.yml'), path.join(tmp, '.github/workflows/pages.yml'));
  fs.cpSync(path.join(REPO_ROOT, '.github/workflows/apk.yml'), path.join(tmp, '.github/workflows/apk.yml'));

  const runGate = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--root', tmp],
    { encoding: 'utf8' });

  const cases = [
    {
      name: 'Vercel publishes the wrong directory',
      break: () => fs.writeFileSync(path.join(tmp, 'vercel.json'), '{"outputDirectory":"missing"}'),
      expect: 'Vercel publishes prototype/',
    },
    {
      name: 'a referenced file disappears (styles/fx.css)',
      break: () => fs.rmSync(path.join(scratch, 'styles/fx.css')),
      expect: 'fx.css',
    },
    {
      name: 'the manifest is corrupted JSON',
      break: () => fs.appendFileSync(path.join(scratch, 'manifest.webmanifest'), '{{{'),
      expect: 'manifest.webmanifest parses',
    },
    {
      name: 'sw.js starts trusting any resolved response again',
      break: () => fs.writeFileSync(path.join(scratch, 'sw.js'),
        read(path.join(scratch, 'sw.js')).replace('if (!fresh.ok) throw new Error(`nova:navigation HTTP ${fresh.status}`);', '')),
      expect: 'failed navigation',
    },
    {
      name: 'a module falls out of the precache',
      break: () => fs.writeFileSync(path.join(scratch, 'sw.js'),
        read(path.join(scratch, 'sw.js')).replace("  './src/surfaces/home.js',\n", '')),
      expect: 'module graph',
    },
    {
      // the exact incident this gate was written for: a Vercel URL minted for
      // one deployment got published as "the site", then stopped resolving
      name: 'a per-deployment Vercel URL is advertised as the site',
      break: () => fs.appendFileSync(path.join(tmp, 'README.md'),
        '\n## Run it\n\nOpen https://nova-os-zephyr-moss.vercel.app on your phone.\n'),
      expect: 'durable address declared in docs/urls.json',
    },
    {
      name: 'docs/urls.json promotes a deployment URL to "production"',
      break: () => fs.writeFileSync(path.join(tmp, 'docs/urls.json'), JSON.stringify({
        production: { githubPages: 'https://y5747m-gif.github.io/Nova-os/', vercel: 'https://nova-os-zephyr-moss.vercel.app/' },
        retired: {},
      })),
      expect: 'durable production domain',
    },
  ];

  let selfFail = 0;
  for (const c of cases) {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.cpSync(PROTO, scratch, { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, 'vercel.json'), path.join(tmp, 'vercel.json'));
    fs.cpSync(path.join(REPO_ROOT, 'docs/urls.json'), path.join(tmp, 'docs/urls.json'), { force: true });
    fs.cpSync(path.join(REPO_ROOT, 'README.md'), path.join(tmp, 'README.md'), { force: true });
    c.break();
    const res = runGate();
    const red = res.status !== 0 && (res.stdout + res.stderr).includes(c.expect);
    if (red) ok(`harness turns RED on: ${c.name}`);
    else { bad(`harness turns RED on: ${c.name}`, `exit=${res.status}`); selfFail++; }
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.cpSync(PROTO, scratch, { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'docs/urls.json'), path.join(tmp, 'docs/urls.json'), { force: true });
  fs.cpSync(path.join(REPO_ROOT, 'README.md'), path.join(tmp, 'README.md'), { force: true });
  const clean = runGate();
  if (clean.status === 0) ok('harness stays GREEN on the clean copy');
  else { bad('harness stays GREEN on the clean copy', `exit=${clean.status}`); selfFail++; }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (selfFail) { console.error(`\n✗ selftest: ${selfFail} expectation(s) broken — the harness cannot be trusted`); process.exit(1); }
  console.log('\n✓ selftest: the harness catches every corruption and passes the clean tree');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
   DISCOVER — read the truth out of the deploy records instead of
   out of a browser history. `gh api` shows what Vercel's app
   actually published for each commit; this turns that into the one
   thing worth knowing: which address is durable and which one is a
   per-deployment URL that is already dying.
   ══════════════════════════════════════════════════════════════ */
async function discover() {
  console.log('\n── discover · what the pipeline really published ──');
  if (!ghToken) console.log('   (no GH_TOKEN/GITHUB_TOKEN — running through the gh CLI if it is authenticated)');
  const deps = await ghApi(`/repos/${REPO}/deployments?per_page=12`);
  if (!Array.isArray(deps) || !deps.length) { console.log('   no deployment records found for ' + REPO); process.exit(0); }
  const urls = urlRegistry();
  const durable = new Set([urls?.production?.githubPages, urls?.production?.vercel].filter(Boolean).map((u) => u.replace(/\/$/, '')));
  let newestProd = null;
  for (const dep of deps) {
    const st = await ghApi(`/repos/${REPO}/deployments/${dep.id}/statuses?per_page=5`);
    const good = Array.isArray(st) ? (st.find((x) => x.state === 'success') ?? st[0]) : null;
    const env = (good?.environment_url || '').replace(/\/$/, '');
    const host = env ? new URL(env).hostname : '(none)';
    const kind = env ? hostKind(host).kind : '—';
    if (dep.environment === 'Production' && good?.state === 'success' && !newestProd) newestProd = { env, at: dep.created_at, sha: dep.sha.slice(0, 8) };
    console.log(`   ${dep.created_at}  ${String(dep.environment).padEnd(10)} ${String(good?.state ?? '?').padEnd(8)} ${env || '—'}` +
      (kind === 'deployment' ? '   ← deployment-scoped, will 404 one day' : kind === 'alias' ? '   ← durable project domain' : ''));
  }
  if (newestProd) {
    console.log(`\n   newest SUCCESSFUL production deploy: ${newestProd.env}  (commit ${newestProd.sha}, ${newestProd.at})`);
    console.log('   open that to prove the app itself is fine — it is NOT the address to publish.');
    console.log('   the durable address is Vercel → project nova-os → Settings → Domains → the production domain,');
    console.log('   then record it in docs/urls.json (production.vercel).');
  }
  const meta = await ghApi(`/repos/${REPO}`);
  const homepage = (meta?.homepage || '').replace(/\/$/, '');
  if (homepage) {
    const okHost = durable.has(homepage);
    console.log(`\n   GitHub "About → Website" field: ${homepage} → ${okHost ? 'declared in docs/urls.json ✓' : 'NOT declared in docs/urls.json ✗'}`);
    if (!okHost) console.log(`   fix it with the durable URL:  gh api -X PATCH repos/${REPO} -f homepage="https://THE-PRODUCTION-DOMAIN/"`);
  } else console.log('\n   GitHub "About → Website" field: (empty) — set it to the value in docs/urls.json');
  process.exit(0);
}

/* ── run ──────────────────────────────────────────────────────── */
console.log('NOVA shipping harness — tools/deploy-check.mjs');
console.log(`repo: ${REPO}${LIVE ? ` · site: ${SITE}` : ' · local mode (hermetic)'}`);

if (SELFTEST) await selftest();
if (DISCOVER) await discover();
localChecks();
if (LIVE && failed === 0) await liveChecks();
else if (LIVE) console.log('\nlive checks skipped — the local gate must be green first');

console.log(`\n${passed}/${passed + failed} checks passed${skipped ? ` · ${skipped} skipped` : ''}`);
if (failed) {
  console.error(`\n✗ shipping harness: ${failed} failure(s)`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(LIVE ? '✓ NOVA is deployable AND delivered — the pipeline is whole' : '✓ NOVA is deployable as-is');
