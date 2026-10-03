# Diagram skill (architecture, flowchart, sequence, ER, ... as HTML/SVG/PNG). Sourced by install.sh.
# Third-party Claude Code plugin, installed via its own marketplace so it keeps updating
# (no version pin: `marketplace add` takes no ref). MIT, no telemetry; generated diagrams load Google Fonts.
# Installed disabled: its long skill description would load in every session.
# Enable when needed: `claude plugin enable diagram-design@diagram-design`.
DIAGRAM_DESIGN_REPO=cathrynlavery/diagram-design
DIAGRAM_DESIGN_PLUGIN=diagram-design@diagram-design

install_diagram-design() {
  # Only disable on first install, so a rerun doesn't undo a manual enable.
  if claude plugin list --json | grep -q "\"id\": \"$DIAGRAM_DESIGN_PLUGIN\""; then
    echo "diagram-design already installed"
    return
  fi
  if ! claude plugin marketplace list --json | grep -q "\"repo\": \"$DIAGRAM_DESIGN_REPO\""; then
    claude plugin marketplace add "$DIAGRAM_DESIGN_REPO"
  fi
  claude plugin install --scope user "$DIAGRAM_DESIGN_PLUGIN"
  claude plugin disable --scope user "$DIAGRAM_DESIGN_PLUGIN"
  echo "diagram-design installed (disabled)"
}
