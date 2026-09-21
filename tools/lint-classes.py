#!/usr/bin/env python3
"""NOVA class lint — every class the JS builds must exist in the stylesheets,
   so a typo can't silently produce an unstyled surface.

   usage: python3 tools/lint-classes.py
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "prototype"
css = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "styles").glob("*.css"))
css_classes = set(re.findall(r"\.([a-zA-Z][\w-]*)", css))

js = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "src").rglob("*.js"))
used: set[str] = set()
for pat in (r"class:\s*'([^']+)'", r"class:\s*\"([^\"]+)\"", r"classList\.(?:add|remove|toggle|contains)\('([^']+)'",
            r"class=\"([^\"]+)\""):
    for m in re.findall(pat, js):
        used.update(t for t in re.sub(r"\$\{[^}]*\}", " ", m).split() if t)
for m in re.findall(r"querySelector(?:All)?\('([^']+)'\)", js):
    used.update(re.findall(r"\.([a-zA-Z][\w-]*)", m))

missing = sorted(c for c in used if c not in css_classes)
if missing:
    print("✗ classes used in JS but missing from CSS:")
    for c in missing:
        print(f"    .{c}")
    sys.exit(1)

print(f"✓ class lint: {len(used)} classes used in JS, all present in CSS")
