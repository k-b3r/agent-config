#!/usr/bin/env python3
"""Inventory what loads into a Claude Code session for the project in cwd.

Prints a markdown report: project signals, plugins (with skill counts and
listing cost), personal skills, current project-local overrides. Read-only.

usage: inventory.py [project_dir]
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
CLAUDE = HOME / '.claude'
CHARS_PER_TOKEN = 4


def load_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}


def frontmatter(skill_md):
    try:
        text = Path(skill_md).read_text(errors='replace')
    except OSError:
        return None, ''
    m = re.match(r'^---\n(.*?)\n---', text, re.S)
    if not m:
        return None, ''
    name = re.search(r'^name:\s*(.+)$', m.group(1), re.M)
    desc = re.search(r'^description:\s*(.+?)(?=^\w[\w-]*:|\Z)', m.group(1), re.M | re.S)
    return (name.group(1).strip().strip('"\'') if name else None,
            ' '.join(desc.group(1).split()).strip('"\'') if desc else '')


def skills_under(root):
    out = []
    for md in sorted(Path(root).glob('**/SKILL.md')):
        if 'node_modules' in md.parts:
            continue
        name, desc = frontmatter(md)
        if name and name not in {n for n, _ in out}:
            out.append((name, len(desc)))
    return out


def project_signals(proj):
    signals = []
    for f in ('package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'Gemfile', 'pom.xml', 'composer.json'):
        for p in [proj / f, *proj.glob(f'*/{f}')]:
            if p.exists() and 'node_modules' not in p.parts:
                signals.append(str(p.relative_to(proj)))
    deps = set()
    for pj in [proj / 'package.json', *proj.glob('*/package.json')]:
        d = load_json(pj)
        deps |= set((d.get('dependencies') or {}) | (d.get('devDependencies') or {}))
    ui = sorted(d for d in deps if d in ('next', 'react', 'vue', 'svelte', '@angular/core', 'vite', 'tailwindcss'))
    try:
        tracked = subprocess.run(['git', '-C', str(proj), 'ls-files'], capture_output=True, text=True, check=True).stdout.split()
        files = [Path(f) for f in tracked]
    except (OSError, subprocess.CalledProcessError):
        files = [p for p in proj.rglob('*') if p.is_file() and not any(x in p.parts for x in ('node_modules', '.git', '.next', 'dist'))]
    exts = {}
    for p in files[:20000]:
        exts[p.suffix] = exts.get(p.suffix, 0) + 1
    top = sorted(((n, e) for e, n in exts.items() if e), reverse=True)[:8]
    markers = [m for m in ('.github', '.linear', 'linear.json', 'shopify.app.toml', 'Dockerfile', 'docs', '.mcp.json') if (proj / m).exists()]
    return signals, ui, top, markers, sorted(deps)


def main():
    proj = Path(sys.argv[1] if len(sys.argv) > 1 else os.getcwd()).resolve()
    user = load_json(CLAUDE / 'settings.json')
    shared = load_json(proj / '.claude/settings.json')
    local = load_json(proj / '.claude/settings.local.json')
    installed = load_json(CLAUDE / 'plugins/installed_plugins.json').get('plugins', {})

    signals, ui, top, markers, deps = project_signals(proj)
    print(f'# Context inventory: {proj}\n')
    print('## Project signals')
    print(f'- manifests: {", ".join(signals) or "none"}')
    print(f'- UI frameworks: {", ".join(ui) or "none (likely CLI/backend)"}')
    print(f'- top extensions: {", ".join(f"{e} ({n})" for n, e in top)}')
    print(f'- markers: {", ".join(markers) or "none"}')
    print(f'- deps ({len(deps)}): {", ".join(deps[:40])}{" ..." if len(deps) > 40 else ""}\n')

    print('## Plugins (toggle with enabledPlugins; plugin skills cannot be hidden individually)')
    print('| plugin | enabled (user/shared/local) | skills | listing ~tokens | skill names |')
    print('|---|---|---|---|---|')
    for pid, entries in installed.items():
        path = entries[0].get('installPath', '') if entries else ''
        sk = skills_under(path) if path else []
        state = '/'.join(str(s.get('enabledPlugins', {}).get(pid, '-')) for s in (user, shared, local))
        cost = sum(n for _, n in sk) // CHARS_PER_TOKEN
        names = ', '.join(n for n, _ in sk[:12]) + (' ...' if len(sk) > 12 else '')
        print(f'| {pid} | {state} | {len(sk)} | {cost} | {names} |')

    print('\n## Personal skills (~/.claude/skills; toggle with skillOverrides)')
    print('| skill | ~tokens | current override |')
    print('|---|---|---|')
    overrides = {**(user.get('skillOverrides') or {}), **(shared.get('skillOverrides') or {}), **(local.get('skillOverrides') or {})}
    for d in sorted((CLAUDE / 'skills').iterdir()):
        if d.name == 'synced' or not (d / 'SKILL.md').exists():
            continue
        name, desc = frontmatter(d / 'SKILL.md')
        print(f'| {name or d.name} | {len(desc) // CHARS_PER_TOKEN} | {overrides.get(name or d.name, "on")} |')

    synced = list((CLAUDE / 'skills/synced').glob('*')) if (CLAUDE / 'skills/synced').exists() else []
    print(f'\n## Synced claude.ai skills: {len(synced)} bundle(s) on disk; syncClaudeAiSkills = {local.get("syncClaudeAiSkills", user.get("syncClaudeAiSkills", "unset (on)"))}')
    print('Full list visible only in the running session (anthropic-skills:*).')
    print(f'\n## claude.ai connectors: disableClaudeAiConnectors = {local.get("disableClaudeAiConnectors", shared.get("disableClaudeAiConnectors", user.get("disableClaudeAiConnectors", "unset (on)")))}')
    print('All-or-nothing. Which connectors exist is visible only in the running session (mcp__claude_ai_* tools).')

    print('\n## Current .claude/settings.local.json')
    print('```json\n' + json.dumps(local, indent=2) + '\n```')


if __name__ == '__main__':
    main()
