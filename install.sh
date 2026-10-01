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
link "$REPO/CLAUDE.md" "$TARGET/CLAUDE.md"
link "$REPO/CODING_STANDARDS.md" "$TARGET/CODING_STANDARDS.md"
link "$REPO/languages" "$TARGET/languages"
for skill in "$REPO"/skills/*/; do
  name="$(basename "$skill")"
  link "${skill%/}" "$TARGET/skills/$name"
done
