#!/usr/bin/env python3
"""One-off migration: map leftover dark-theme faded-white tokens to black-opacity
equivalents so secondary text / hints / dividers stay visible on the light theme.

Excludes surfaces that are intentionally dark (e.g. fullscreen image viewer).
"""
import os
import re

LIB = os.path.join(os.path.dirname(__file__), '..', 'lib')

# Files that intentionally render on a dark backdrop — leave untouched.
EXCLUDE = {
    os.path.normpath(os.path.join(LIB, 'modules/customers/customer_tabs/image_viewer_helper.dart')),
}

# Order matters: longer tokens first to avoid partial overlaps.
REPLACEMENTS = [
    ('Colors.white70', 'Colors.black54'),
    ('Colors.white60', 'Colors.black45'),
    ('Colors.white54', 'Colors.black45'),
    ('Colors.white38', 'Colors.black38'),
    ('Colors.white30', 'Colors.black26'),
    ('Colors.white24', 'Colors.black12'),
    ('Colors.white12', 'Colors.black12'),
    ('Colors.white10', 'Colors.black12'),
]

changed_files = 0
total_hits = 0

for root, _, files in os.walk(LIB):
    for fn in files:
        if not fn.endswith('.dart'):
            continue
        path = os.path.normpath(os.path.join(root, fn))
        if path in EXCLUDE:
            continue
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()
        original = src
        file_hits = 0
        for old, new in REPLACEMENTS:
            # word boundary after token so white70 doesn't match white700 etc.
            pattern = re.compile(re.escape(old) + r'(?![0-9A-Za-z])')
            src, n = pattern.subn(new, src)
            file_hits += n
        if src != original:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(src)
            changed_files += 1
            total_hits += file_hits
            print(f'{file_hits:3d}  {os.path.relpath(path, LIB)}')

print(f'\nDone. {total_hits} replacements across {changed_files} files.')
