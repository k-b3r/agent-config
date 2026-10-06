# Code knowledge graph (symbols, call paths, impact), used as a CLI. Sourced by install.sh.
# No MCP server: its file watcher per session costs more than `codegraph sync`
# before a query (TOOLS.md). Not `codegraph install` either, which would write
# into the symlinked ~/.claude/CLAUDE.md. Usage guidance lives in TOOLS.md.
# Per-repo indexing (`codegraph init`) stays opt-in.
CODEGRAPH_VERSION=1.6.2

install_codegraph() {
  if [ "$(codegraph --version 2>/dev/null)" != "$CODEGRAPH_VERSION" ]; then
    npm i -g "@colbymchenry/codegraph@$CODEGRAPH_VERSION"
  fi
  # Anonymous usage stats are on by default; re-enable with `codegraph telemetry on`.
  codegraph telemetry off >/dev/null
  echo "codegraph $CODEGRAPH_VERSION ready"
}
