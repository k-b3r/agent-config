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

# Tools: each tools/<name>.sh defines install_<name>; skip with AGENT_CONFIG_SKIP_TOOLS=1.
if [ "${AGENT_CONFIG_SKIP_TOOLS:-0}" != "1" ]; then
  for tool in "$REPO"/tools/*.sh; do
    # shellcheck source=/dev/null
    . "$tool"
    "install_$(basename "$tool" .sh)"
  done
fi
