# Tools

Installed and wired by `install.sh` (one script per tool in `tools/`).

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory at the repo root), reach for it before grep/find or reading files when you need to locate or understand code:

- MCP tool `codegraph_explore` answers most code questions in one call: the relevant symbols' source plus the call paths between them. Name a file or symbol in the query to read its current line-numbered source. It loads on demand; if listed but deferred, load it by name via tool search.
- Shell fallback: `codegraph explore "<symbols or question>"` prints the same output.
- Before an edit that changes a signature or shared type, check impact (callers, dependents) with CodeGraph rather than grep.

No `.codegraph/` directory: skip CodeGraph. Indexing a repo (`codegraph init`, plus `.codegraph/` in `.gitignore`) is the user's decision.

## Diagram Design

Third-party plugin (`cathrynlavery/diagram-design`), installed **disabled** so its skill description stays out of every session. When a diagram is needed (architecture, flowchart, sequence, ER, timeline, ...), ask the user to run `claude plugin enable diagram-design@diagram-design` and start a new session; disable again after.
