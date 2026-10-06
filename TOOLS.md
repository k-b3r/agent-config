# Tools

Installed and wired by `install.sh` (one script per tool in `tools/`).

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory at the repo root), use it for blast radius, not for locating code. A grep-only vs CodeGraph-first benchmark (2026-10-06, buy-and-sell, 4 navigation tasks against a compiler answer key) found equal accuracy with grep ~10% cheaper and ~27% faster; CodeGraph's one edge was transitive impact (callers of callers, tests reached indirectly). CLI only, no MCP server: a watcher per session costs more than syncing on demand (sync under 1 s, full index ~20 s on 400 files).

- Run `codegraph sync` first; nothing keeps the index current between sessions.
- Locating code and direct callers: grep and read. CodeGraph's `callers` reports the enclosing function's line, not the call's, and misses strings, config, RPC names and HTTP hops.
- Before changing a signature or shared type: `codegraph impact <symbol> --depth 2` for indirect callers and tests, then the rename checklist's greps for strings, config and dynamic lookups. Confirm each line with grep.
- Scoping delegated work: list owned paths from `impact` on the ticket's main symbols. Before running two tickets in parallel, compare their impact sets; overlapping files run in sequence.
- From a worktree (not indexed): query the main checkout with `-p <main repo path>`; it's the base branch's code, fine for callers and scope.

No `.codegraph/` directory: skip CodeGraph. Indexing a repo (`codegraph init`, plus `.codegraph/` in `.gitignore`) is the user's decision.

## Diagram Design

Third-party plugin (`cathrynlavery/diagram-design`), installed **disabled** so its skill description stays out of every session. When a diagram is needed (architecture, flowchart, sequence, ER, timeline, ...), ask the user to run `claude plugin enable diagram-design@diagram-design` and start a new session; disable again after.
