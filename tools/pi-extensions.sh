# Pi extensions: symlink each pi-extensions/*.ts into ~/.pi/agent/extensions. Sourced by install.sh.
install_pi-extensions() {
  local dir="$HOME/.pi/agent/extensions" f dest
  [ -d "$HOME/.pi/agent" ] || { echo "pi not set up, skipping pi-extensions"; return; }
  mkdir -p "$dir"
  for f in "$REPO"/pi-extensions/*.ts; do
    dest="$dir/$(basename "$f")"
    [ "$(readlink -f "$dest")" = "$(readlink -f "$f")" ] && continue
    ln -sf "$f" "$dest"
    echo "linked $dest"
  done
}
