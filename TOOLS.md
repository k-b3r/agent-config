# Tools

Installed and wired by `install.sh` (one script per tool in `tools/`).

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory at the repo root), reach for it before grep/find or reading files when you need to locate or understand code. CLI only, no MCP server: a watcher per session costs more than syncing on demand (measured 2026-10-06 on a 400-file repo: sync under 1 s, full index ~20 s).

- Run `codegraph sync` first; nothing keeps the index current between sessions.
- `codegraph explore "<symbols or question>"` answers most code questions in one call: the relevant symbols' source plus the call paths between them.
- Before an edit that changes a signature or shared type: `codegraph impact <symbol>` (or `callers`). It covers code references only; strings, config and dynamic lookups still need grep (rename checklist).
- From a worktree (not indexed): query the main checkout with `-p <main repo path>`; it's the base branch's code, fine for locating owners and callers.
- Scoping delegated work: list a ticket's owned paths from `explore` / `impact`, not from grep.

No `.codegraph/` directory: skip CodeGraph. Indexing a repo (`codegraph init`, plus `.codegraph/` in `.gitignore`) is the user's decision.

## Diagram Design

Third-party plugin (`cathrynlavery/diagram-design`), installed **disabled** so its skill description stays out of every session. When a diagram is needed (architecture, flowchart, sequence, ER, timeline, ...), ask the user to run `claude plugin enable diagram-design@diagram-design` and start a new session; disable again after.
