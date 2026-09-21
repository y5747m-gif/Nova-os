#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# NOVA MOTION lint — docs/02-motion-language.md §9
# Everything must animate through the engine. Surfaces may not
# spin their own rAF loops, transitions or easing curves.
# ══════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
check() { # <pattern> <description> <files...>
  local pattern="$1" desc="$2"; shift 2
  local hits
  hits=$(grep -RInE "$pattern" "$@" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "✗ $desc"
    echo "$hits" | sed 's/^/    /'
    FAIL=1
  else
    echo "✓ $desc"
  fi
}

echo "NOVA MOTION lint"
echo "──────────────────────────────────────────────"

# 1. no ad-hoc animation loops outside the engine
check 'requestAnimationFrame' \
  "no hand-rolled rAF outside motion/" \
  prototype/src/surfaces prototype/src/core prototype/src/main.js

# 2. no CSS easing authored in JS
check 'cubic-bezier|ease-in-out|easeInOut' \
  "no ad-hoc easing curves in JS" \
  prototype/src/surfaces prototype/src/core prototype/src/main.js

# 3. no inline CSS transitions from surfaces (state changes go through the engine)
check 'style\.transition\s*=' \
  "no inline style.transition in surfaces" \
  prototype/src/surfaces prototype/src/core

# 4. mutation-based animation is banned: transforms must be written by the engine
check '\.animate\(' \
  "no Element.animate()" \
  prototype/src

# 5. the engine itself must never use time-based easing for spatial moves
if grep -InE 'setTimeout' prototype/src/motion/motion.js >/dev/null 2>&1; then
  echo "✗ motion.js uses timers for spatial motion"
  FAIL=1
else
  echo "✓ motion.js is timer-free for spatial motion"
fi

echo "──────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then echo "motion lint: clean"; else echo "motion lint: FAILED"; fi
exit "$FAIL"
