#!/usr/bin/env bash
# Symlink this repo's agent config into ~/.claude. Safe to rerun.
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

# Guard hook: blocks pushes to main, --no-verify, AI attribution, generated-file edits.
mkdir -p "$TARGET/hooks"
link "$REPO/hooks/guard.mjs" "$TARGET/hooks/agent-config-guard.mjs"
if [ -e "$TARGET/settings.json" ] && ! grep -q agent-config-guard.mjs "$TARGET/settings.json"; then
  mkdir -p "$BACKUP"
  cp "$TARGET/settings.json" "$BACKUP/settings.json"
fi
node "$REPO/hooks/install-settings.mjs" "$TARGET/settings.json" 'node "$HOME/.claude/hooks/agent-config-guard.mjs"'

# CLI tools and Pi/Claude extensions are installed by terminal-config.

echo "CLI tools and Pi/Claude extensions are installed by terminal-config"
