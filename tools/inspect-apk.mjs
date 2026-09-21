#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   NOVA APK inspector — "trust what you install"

   Reads the APK's own ZIP directory (no external tools required), reports
   what is really inside, and formats a Markdown block that CI embeds in the
   GitHub Release notes. `aapt2`/`apksigner` are used when they happen to be
   on PATH, but their absence is never a failure.

   usage: node tools/inspect-apk.mjs <path.apk> [--json]
   ══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const file = args.find((a) => !a.startsWith('--')) ?? 'dist/nova-os-latest.apk';

if (!fs.existsSync(file)) {
  console.error(`✗ APK not found: ${file}`);
  process.exit(1);
}

const buf = fs.readFileSync(file);

/* ── minimal ZIP central-directory reader ─────────────────────── */
function readEntries(buf) {
  const EOCD = 0x06054b50;
  const CE = 0x02014b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP/APK file (no end-of-central-directory record)');

  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < total; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CE) break;
    const method = buf.readUInt16LE(off + 10);
    const compressed = buf.readUInt32LE(off + 20);
    const uncompressed = buf.readUInt32LE(off + 24);
    const localOffset = buf.readUInt32LE(off + 42);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compressed, uncompressed, localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const entries = readEntries(buf);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Signatures. AGP does not write META-INF/*.RSA when minSdk >= 24 — those APKs are
 * signed with the APK Signature Scheme v2/v3, whose block sits between the last entry
 * and the central directory. Both shapes are recognised here.
 */
const SIGNING_MAGIC = Buffer.from('APK Sig Block 42', 'ascii');
const SCHEMES = new Map([
  [0x7109871a, 'v2 (APK Signature Scheme v2)'],
  [0xf05368c0, 'v3 (APK Signature Scheme v3)'],
  [0x1b93ad61, 'v3.1'],
  [0x42726577, 'source stamp'],
]);

function readSigningSchemes(buf) {
  const eocdOffset = buf.length - 22 - (buf.readUInt16LE(buf.length - 2) || 0);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (cdOffset < 32) return [];
  if (!buf.subarray(cdOffset - 16, cdOffset).equals(SIGNING_MAGIC)) return [];
  const size = Number(buf.readBigUInt64LE(cdOffset - 24));
  const start = cdOffset - size - 8;
  const schemes = [];
  let cursor = start + 8;
  const end = cdOffset - 24;
  while (cursor + 12 <= end) {
    const len = Number(buf.readBigUInt64LE(cursor));
    const id = buf.readUInt32LE(cursor + 8);
    const label = SCHEMES.get(id);
    if (label) schemes.push(label);
    if (len < 4) break;
    cursor += 8 + len;
  }
  return schemes;
}

const signingSchemes = readSigningSchemes(buf);

const byPrefix = (p) => entries.filter((e) => e.name.startsWith(p));
const bytesOf = (list) => list.reduce((sum, e) => sum + e.uncompressed, 0);

const webFiles = byPrefix('assets/www/');
const signatures = entries.filter((e) => /^META-INF\/.*\.(RSA|DSA|EC|SF)$/i.test(e.name));
const dexFiles = entries.filter((e) => /^classes\d*\.dex$/.test(e.name));
const libs = entries.filter((e) => e.name.startsWith('lib/'));
const resources = entries.filter((e) => e.name === 'resources.arsc');
const manifestEntry = entries.find((e) => e.name === 'AndroidManifest.xml');

const iconEntries = webFiles.filter((e) => /assets\/www\/icons\/icon-\d+\.png$/.test(e.name));
const hasServiceWorker = webFiles.some((e) => e.name === 'assets/www/sw.js');
const hasManifest = webFiles.some((e) => e.name === 'assets/www/manifest.webmanifest');
const webVersion = (() => {
  const v = webFiles.find((e) => e.name === 'assets/www/version.txt');
  if (!v) return null;
  try { return readEntryText(buf, v).trim(); } catch { return null; }
})();

/** Read an entry's bytes straight from the ZIP (local header → data, inflate if needed). */
function readEntryText(buf, entry) {
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`unsupported method ${entry.method}`);
  const nameLen = buf.readUInt16LE(entry.localOffset + 26);
  const extraLen = buf.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressed);
  const bytes = entry.method === 0 ? raw : zlib.inflateRawSync(raw);
  return bytes.toString('utf8');
}

/* ── optional external tooling ────────────────────────────────── */
function run(cmd, cmdArgs) {
  const res = spawnSync(cmd, cmdArgs, { encoding: 'utf8' });
  if (res.error || res.status !== 0) return null;
  return (res.stdout || '') + (res.stderr || '');
}

function findBuildTool(name) {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, '/usr/local/lib/android/sdk']
    .filter(Boolean);
  for (const root of roots) {
    const dir = path.join(root, 'build-tools');
    if (!fs.existsSync(dir)) continue;
    const versions = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const v of versions.reverse()) {
      const candidate = path.join(dir, v, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return run('which', [name]) ? name : null;
}

const badgingTool = findBuildTool('aapt2');
const badging = badgingTool ? run(badgingTool, ['dump', 'badging', file]) : null;
const pick = (re) => (badging?.split('\n').find((l) => re.test(l)) || '').trim();
const permissions = (badging?.split('\n').filter((l) => l.startsWith('uses-permission:')) || [])
  .map((l) => l.replace("uses-permission: name='", '').replace("'", ''));

const signerTool = findBuildTool('apksigner');
const certs = signerTool ? run(signerTool, ['verify', '--print-certs', file]) : null;
const certLine = certs?.split('\n').find((l) => /Signer #1 certificate DN/i.test(l))?.trim() || null;

/* ── report ───────────────────────────────────────────────────── */
const report = {
  file: path.basename(file),
  size: buf.length,
  sha256,
  package: pick(/^package:/).replace(/^package:\s*/, '') || null,
  label: pick(/^application-label:/).replace(/^application-label:\s*/, '').replace(/'/g, '') || null,
  launchable: pick(/^launchable-activity:/).replace(/^launchable-activity:\s*/, '') || null,
  minSdk: pick(/^sdkVersion:/).replace(/^sdkVersion:\s*/, '') || null,
  targetSdk: pick(/^targetSdkVersion:/).replace(/^targetSdkVersion:\s*/, '') || null,
  permissions,
  signatureFiles: signatures.map((e) => e.name),
  signingSchemes,
  certificate: certLine,
  dex: dexFiles.length,
  nativeLibs: libs.length,
  resourcesTable: resources.length > 0,
  manifestPresent: !!manifestEntry,
  webApp: {
    files: webFiles.length,
    bytes: bytesOf(webFiles),
    version: webVersion,
    icons: iconEntries.length,
    serviceWorker: hasServiceWorker,
    manifest: hasManifest,
  },
};

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('### ما تم التحقق منه فعليًا · verified build');
  console.log('');
  console.log('```');
  console.log(`file:        ${report.file} (${mb(report.size)})`);
  console.log(`package:     ${report.package ?? 'unknown'}`);
  console.log(`label:       ${report.label ?? 'unknown'}`);
  console.log(`launchable:  ${report.launchable ?? 'unknown'}`);
  console.log(`sdk:         min ${report.minSdk ?? '?'} / target ${report.targetSdk ?? '?'}`);
  console.log(`manifest:    ${report.manifestPresent ? 'present' : 'MISSING'}`);
  console.log(`dex:         ${report.dex} classes*.dex`);
  console.log(`native libs: ${report.nativeLibs}`);
  console.log('permissions:');
  for (const p of report.permissions) console.log(`  - ${p}`);
  console.log('signature:');
  if (report.signatureFiles.length === 0 && report.signingSchemes.length === 0) {
    console.log('  - none detected');
  }
  for (const s of report.signatureFiles) console.log(`  - ${s} (v1/JAR signing)`);
  for (const s of report.signingSchemes) console.log(`  - APK Signing Block: ${s}`);
  if (report.certificate) console.log(`  - ${report.certificate}`);
  console.log('web app inside the APK:');
  console.log(`  - assets/www files: ${report.webApp.files} (${mb(report.webApp.bytes)})`);
  console.log(`  - version: ${report.webApp.version ?? 'n/a'}`);
  console.log(`  - icons: ${report.webApp.icons} · service worker: ${report.webApp.serviceWorker} · manifest: ${report.webApp.manifest}`);
  console.log(`sha256:      ${report.sha256}`);
  console.log('```');
}

/* fail only on things that make the APK unusable */
const fatal = [];
if (!report.manifestPresent) fatal.push('AndroidManifest.xml is missing');
if (!report.resourcesTable) fatal.push('resources.arsc is missing');
if (report.dex === 0) fatal.push('no classes.dex — nothing would run');
if (report.webApp.files < 10) fatal.push(`only ${report.webApp.files} web files inside — the experience would be broken`);
if (report.signatureFiles.length === 0 && report.signingSchemes.length === 0) {
  fatal.push('APK is not signed — Android will refuse to install it');
}

if (fatal.length) {
  console.log('');
  console.log('⚠️ **verification findings**');
  console.log('');
  for (const f of fatal) console.log(`- ${f}`);
  console.log('');
  console.log(`diagnostics: entries=${entries.length} signed=${report.signatureFiles.length + report.signingSchemes.length} dex=${report.dex} web=${report.webApp.files}`);
  console.error(`\n✗ APK verification failed: ${fatal.join('; ')}`);
  process.exit(1);
}

console.error(`\n✓ APK looks installable (${report.webApp.files} web files, signed, ${mb(report.size)})`);
