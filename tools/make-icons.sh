#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# NOVA icon set — regenerates every launcher / store icon from
# icons/nova-icon-source.png (the 1024² master).
#
#   usage: bash tools/make-icons.sh
#   needs: ImageMagick (`convert`) — apt install imagemagick
#
# Sizing follows the Android adaptive-icon safe zone (docs/05 §8):
# the "any" icons keep the mark at ~76 % of the canvas, the maskable
# ones at ~58 % so no launcher mask can clip the orb.
# ══════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="prototype/icons/nova-icon-source.png"
OUT="prototype/icons"

[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }

# The master is a full-bleed render: sample its own background so every
# generated canvas matches seamlessly (no visible square inside the icon).
BG="$(convert "$SRC" -format '%[pixel:p{6,6}]' info:)"
# And crop to the mark itself, so one scale factor controls the safe zone.
MARK=/tmp/nova_icon_mark.png
convert "$SRC" -gravity center -crop 640x640+0+10 +repage -strip "$MARK"
echo "background: $BG   mark: $(identify -format '%wx%h' "$MARK")"

# ── helpers ────────────────────────────────────────────────────
# square icon with the mark scaled to <ratio> of the canvas
make_any() { # <size> <ratio> <file>
  local size="$1" ratio="$2" file="$3"
  local inner
  inner=$(python3 -c "print(int($size*$ratio))")
  convert "$MARK" -resize "${inner}x${inner}" \
    -background "$BG" -gravity center -extent "${size}x${size}" \
    -strip -define png:compression-level=9 "$file"
}

make_round() { # <size> <ratio> <file> — circle mask, for legacy launchers
  local size="$1" ratio="$2" file="$3"
  make_any "$size" "$ratio" /tmp/nova_round.png
  convert /tmp/nova_round.png \
    \( +clone -alpha extract -draw "fill black polygon 0,0 0,$size $size,0 fill white circle $((size/2)),$((size/2)) $((size/2)),0" \
       \( +clone -flip \) -compose Multiply -composite \
       \( +clone -flop \) -compose Multiply -composite \) \
    -alpha off -compose CopyOpacity -composite -strip "$file"
}

# ── PWA / web app manifest (also used as the Android fallback icons) ──
make_any 512 0.76 "$OUT/icon-512.png"
make_any 192 0.76 "$OUT/icon-192.png"
make_any 180 0.76 "$OUT/apple-touch-icon.png"
make_any 512 0.58 "$OUT/icon-maskable-512.png"
make_any 32  0.86 "$OUT/favicon-32.png"

# ── Android launcher mipmaps (web-app wrapper) ──────────────────
declare -A DPI=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
for dpi in "${!DPI[@]}"; do
  size="${DPI[$dpi]}"
  dir="android/app/src/main/res/mipmap-$dpi"
  mkdir -p "$dir"
  make_any "$size" 0.76 "$dir/ic_launcher.png"
  make_round "$size" 0.76 "$dir/ic_launcher_round.png"
done

# ── adaptive icon: the background is the NOVA bg, the mark is the orb ──
for dpi in "${!DPI[@]}"; do
  size=$(( ${DPI[$dpi]} * 108 / 48 ))          # adaptive canvases are 108dp
  dir="android/app/src/main/res/mipmap-$dpi"
  convert -size "${size}x${size}" "xc:$BG" -strip "$dir/ic_launcher_background.png"
  inner=$(python3 -c "print(int($size*0.56))")
  convert "$MARK" -resize "${inner}x${inner}" -background none -gravity center \
    -extent "${size}x${size}" -strip "$dir/ic_launcher_foreground.png"
done

echo "icons written:"
ls -1 "$OUT" | sed 's/^/  icons\//'
du -sh "$OUT"
