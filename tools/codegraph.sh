# Code knowledge graph (symbols, call paths, impact) over MCP. Sourced by install.sh.
# Wired by hand instead of `codegraph install`, which would write into the
# symlinked ~/.claude/CLAUDE.md and set alwaysLoad (tool schemas in every session).
# Usage guidance lives in TOOLS.md. Per-repo indexing (`codegraph init`) stays opt-in.
CODEGRAPH_VERSION=1.6.2

install_codegraph() {
  if [ "$(codegraph --version 2>/dev/null)" != "$CODEGRAPH_VERSION" ]; then
    npm i -g "@colbymchenry/codegraph@$CODEGRAPH_VERSION"
  fi
  # Anonymous usage stats are on by default; re-enable with `codegraph telemetry on`.
  codegraph telemetry off >/dev/null
  if ! claude mcp get codegraph >/dev/null 2>&1; then
    claude mcp add --scope user codegraph -- codegraph serve --mcp
  fi
  echo "codegraph $CODEGRAPH_VERSION ready"
}
