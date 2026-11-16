#!/usr/bin/env bash
# Symlink this repo's agent config into ~/.claude, ~/.pi/agent and ~/.local/bin. Safe to rerun.
# Only touches entries this repo owns; third-party skills in ~/.claude/skills are left alone.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.claude"
BACKUP="$TARGET/backup-$(date +%Y%m%d-%H%M%S)"

link() {
  local src="$1" dest="$2"
  if [ -L "$dest" ] && [ "$(readlink -f "$dest")" = "$(readlink -f "$src")" ]; then
    return
  fi
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    mkdir -p "$BACKUP"
    mv "$dest" "$BACKUP/"
    echo "backed up $dest -> $BACKUP/"
  fi
  ln -s "$src" "$dest"
  echo "linked $dest"
}

# Removes links left behind by a skill or extension that was renamed or deleted here: a dangling
# link in $1 whose target is under $2. A link that points anywhere else is not ours to remove.
prune() {
  local dir="$1" owned="$2" dest
  for dest in "$dir"/*; do
    if [ -L "$dest" ] && [ ! -e "$dest" ] && [[ "$(readlink "$dest")" == "$owned"/* ]]; then
      rm "$dest"
      echo "removed stale link $dest"
    fi
  done
}

mkdir -p "$TARGET/skills"
link "$REPO/AGENTS.md" "$TARGET/CLAUDE.md"
# pi reads the same file as its global instructions.
if [ -d "$HOME/.pi/agent" ]; then
  link "$REPO/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
fi
link "$REPO/CODING_STANDARDS.md" "$TARGET/CODING_STANDARDS.md"
link "$REPO/TOOLS.md" "$TARGET/TOOLS.md"
link "$REPO/languages" "$TARGET/languages"
link "$REPO/standards" "$TARGET/standards"
for skill in "$REPO"/skills/*/; do
  name="$(basename "$skill")"
  link "${skill%/}" "$TARGET/skills/$name"
done
prune "$TARGET/skills" "$REPO/skills"
# pi reads skills from ~/.pi/agent/skills.
if [ -d "$HOME/.pi/agent" ]; then
  mkdir -p "$HOME/.pi/agent/skills"
  for skill in "$REPO"/skills/*/; do
    name="$(basename "$skill")"
    link "${skill%/}" "$HOME/.pi/agent/skills/$name"
  done
  prune "$HOME/.pi/agent/skills" "$REPO/skills"
fi

# Pi extensions: the guard (same rules as the hook below, on pi's tool_call) and the standards loader
# (pi does not expand the @ imports in AGENTS.md). Plain .js, no build step.
if [ -d "$HOME/.pi/agent" ]; then
  mkdir -p "$HOME/.pi/agent/extensions"
  for ext in "$REPO"/pi/extensions/*.js; do
    link "$ext" "$HOME/.pi/agent/extensions/$(basename "$ext")"
  done
  prune "$HOME/.pi/agent/extensions" "$REPO/pi/extensions"
fi

# Guard hook: blocks pushes to main, --no-verify, AI attribution, generated-file edits.
mkdir -p "$TARGET/hooks"
link "$REPO/hooks/guard.mjs" "$TARGET/hooks/agent-config-guard.mjs"
if [ -e "$TARGET/settings.json" ] && ! grep -q agent-config-guard.mjs "$TARGET/settings.json"; then
  mkdir -p "$BACKUP"
  cp "$TARGET/settings.json" "$BACKUP/settings.json"
fi
node "$REPO/hooks/install-settings.mjs" "$TARGET/settings.json" 'node "$HOME/.claude/hooks/agent-config-guard.mjs"'

# `pi-sync push|pull|run|schedule`: Pi session backup to Drive (docs/pi-sync/). Plain Node, no install step.
mkdir -p "$HOME/.local/bin"
link "$REPO/scripts/pi-sync.mjs" "$HOME/.local/bin/pi-sync"

# CLI tools and Pi/Claude extensions are installed by terminal-config.

echo "CLI tools and Pi/Claude extensions are installed by terminal-config"
