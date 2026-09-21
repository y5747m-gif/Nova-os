#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Copy the web experience into the APK's assets, exactly as the CI
# workflow does it. Run this before a local Gradle build:
#
#   bash tools/stage-assets.sh && (cd android && gradle assembleDebug)
# ══════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="prototype"
DEST="android/app/src/main/assets/www"

[ -d "$SRC" ] || { echo "missing $SRC"; exit 1; }
mkdir -p "$DEST"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude 'node_modules' --exclude '*.map' "$SRC/" "$DEST/"
else
  rm -rf "$DEST" && mkdir -p "$DEST"
  cp -R "$SRC/." "$DEST/"
fi

# a marker the app can read to confirm which build it is
echo "$(cat VERSION)" > "$DEST/version.txt"

echo "staged $(find "$DEST" -type f | wc -l) files into $DEST"
