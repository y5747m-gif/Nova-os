#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   NOVA version bump — one command, three sources of truth:
     /VERSION                        (Gradle versionName, CI asset name)
     prototype/src/core/version.js   (shown in the UI)
     prototype/sw.js                 (cache generation → forces an update)
   usage: node tools/bump-version.mjs 0.2.0
   ══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const next = process.argv[2];

if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('usage: node tools/bump-version.mjs <major.minor.patch>');
  process.exit(2);
}

const VERSION_FILE = path.join(ROOT, 'VERSION');
const VERSION_JS = path.join(ROOT, 'prototype/src/core/version.js');
const SW_JS = path.join(ROOT, 'prototype/sw.js');

const previous = fs.readFileSync(VERSION_FILE, 'utf8').trim();

function patch(file, pattern, replacement, label) {
  const src = fs.readFileSync(file, 'utf8');
  if (!pattern.test(src)) {
    console.error(`✗ could not find the version in ${label}`);
    process.exit(1);
  }
  fs.writeFileSync(file, src.replace(pattern, replacement));
  console.log(`✓ ${label}`);
}

fs.writeFileSync(VERSION_FILE, `${next}\n`);
console.log('✓ VERSION');

patch(VERSION_JS, /NOVA_VERSION = '[\d.]+'/, `NOVA_VERSION = '${next}'`, 'prototype/src/core/version.js');
patch(SW_JS, /NOVA_VERSION = '[\d.]+'/, `NOVA_VERSION = '${next}'`, 'prototype/sw.js');

console.log(`\nNOVA ${previous} → ${next}`);
console.log('next: bash tools/stage-assets.sh   (then build, or push to main for CI)');
