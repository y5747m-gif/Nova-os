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

   3. SELFTEST (--selftest): the harness tests itself. It corrupts a
      scratch copy of prototype/ three different ways and asserts its
      own local checks turn RED on every corruption and stay GREEN on
      the clean copy. A harness that cannot fail is a rubber stamp.

   usage:
     node tools/deploy-check.mjs                  # local gate
     node tools/deploy-check.mjs --live           # after a deploy (CI + manual)
     node tools/deploy-check.mjs --live --site https://me.github.io/repo/
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
  const pages = await ghApi(`/repos/${REPO}/pages`);
  if (pages === null) {
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
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const res = await httpGet(SITE + bust);
    if (res && res.status === 200 && res.body.includes('<title>NOVA OS')) { siteOk = true; body = res.body; break; }
    console.log(`      attempt ${attempt}/${RETRIES}: ${res ? `HTTP ${res.status}` : 'no response'} — propagating…`);
    if (attempt < RETRIES) await sleep(WAIT_MS);
  }
  if (!check('the deployed site serves NOVA (200 + title)', siteOk, SITE)) return;
  void body;

  const swRes = await httpGet(`${SITE}sw.js${bust}`);
  check('deployed sw.js answers 200', !!swRes && swRes.status === 200, swRes ? `HTTP ${swRes.status}` : 'no response');
  check('deployed sw.js is THIS version (what was pushed is what is live)',
    !!swRes && swRes.body.includes(`NOVA_VERSION = '${version}'`), `expected ${version}`);

  const manRes = await httpGet(`${SITE}manifest.webmanifest${bust}`);
  let manOk = !!manRes && manRes.status === 200;
  if (manOk) { try { JSON.parse(manRes.body); } catch { manOk = false; } }
  check('deployed manifest.webmanifest answers 200 + valid JSON', manOk, manRes ? `HTTP ${manRes.status}` : 'no response');

  /* 3 · the APK the install sheet downloads is really there */
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
  fs.mkdirSync(path.join(tmp, '.github/workflows'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, '.github/workflows/pages.yml'), path.join(tmp, '.github/workflows/pages.yml'));
  fs.cpSync(path.join(REPO_ROOT, '.github/workflows/apk.yml'), path.join(tmp, '.github/workflows/apk.yml'));

  const runGate = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--root', tmp],
    { encoding: 'utf8' });

  const cases = [
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
      name: 'a module falls out of the precache',
      break: () => fs.writeFileSync(path.join(scratch, 'sw.js'),
        read(path.join(scratch, 'sw.js')).replace("  './src/surfaces/home.js',\n", '')),
      expect: 'module graph',
    },
  ];

  let selfFail = 0;
  for (const c of cases) {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.cpSync(PROTO, scratch, { recursive: true });
    c.break();
    const res = runGate();
    const red = res.status !== 0 && (res.stdout + res.stderr).includes(c.expect);
    if (red) ok(`harness turns RED on: ${c.name}`);
    else { bad(`harness turns RED on: ${c.name}`, `exit=${res.status}`); selfFail++; }
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.cpSync(PROTO, scratch, { recursive: true });
  const clean = runGate();
  if (clean.status === 0) ok('harness stays GREEN on the clean copy');
  else { bad('harness stays GREEN on the clean copy', `exit=${clean.status}`); selfFail++; }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (selfFail) { console.error(`\n✗ selftest: ${selfFail} expectation(s) broken — the harness cannot be trusted`); process.exit(1); }
  console.log('\n✓ selftest: the harness catches every corruption and passes the clean tree');
  process.exit(0);
}

/* ── run ──────────────────────────────────────────────────────── */
console.log('NOVA shipping harness — tools/deploy-check.mjs');
console.log(`repo: ${REPO}${LIVE ? ` · site: ${SITE}` : ' · local mode (hermetic)'}`);

if (SELFTEST) await selftest();
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
