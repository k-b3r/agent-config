#!/usr/bin/env python3
"""Merge a JSON patch into <project>/.claude/settings.local.json.

Objects merge key by key; other values replace. Existing keys not in the
patch (permissions, hooks...) are kept. Prints before/after diff.

usage: apply.py '<json patch>' [project_dir]
"""
import difflib
import json
import os
import sys
from pathlib import Path

VALID_OVERRIDES = {'on', 'name-only', 'user-invocable-only', 'off'}


def merge(base, patch):
    out = dict(base)
    for k, v in patch.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def main():
    patch = json.loads(sys.argv[1])
    for skill, state in (patch.get('skillOverrides') or {}).items():
        if state not in VALID_OVERRIDES:
            sys.exit(f'invalid skillOverrides value for {skill}: {state!r} (use one of {sorted(VALID_OVERRIDES)})')
    proj = Path(sys.argv[2] if len(sys.argv) > 2 else os.getcwd()).resolve()
    path = proj / '.claude/settings.local.json'
    before = json.loads(path.read_text()) if path.exists() else {}
    after = merge(before, patch)
    a = json.dumps(before, indent=2).splitlines()
    b = json.dumps(after, indent=2).splitlines()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(after, indent=2) + '\n')
    print('\n'.join(difflib.unified_diff(a, b, 'before', 'after', lineterm='')) or 'no change')


if __name__ == '__main__':
    main()
