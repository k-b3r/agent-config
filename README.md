# agent-config

Personal Claude Code setup: global instructions, general coding standards, own skills.

```
CLAUDE.md            -> ~/.claude/CLAUDE.md (imports CODING_STANDARDS.md)
CODING_STANDARDS.md  -> ~/.claude/CODING_STANDARDS.md (language-agnostic)
TOOLS.md             -> ~/.claude/TOOLS.md (imported by CLAUDE.md: when to use each tool)
tools/<name>.sh      -> sourced by install.sh: installs + wires one tool (pinned, idempotent)
languages/           -> ~/.claude/languages (read on demand per language)
standards/           -> ~/.claude/standards (do/don't examples per section, read on demand)
skills/<name>/       -> ~/.claude/skills/<name>
```

## Install

```bash
git clone git@github.com:k-b3r/agent-config.git ~/Develop/agent-config
~/Develop/agent-config/install.sh
```

Symlinks config, then installs each tool in `tools/` (pinned version, user-scope MCP, telemetry off). Existing non-linked files are moved to `~/.claude/backup-<timestamp>/`. Rerun after adding a skill or tool; `AGENT_CONFIG_SKIP_TOOLS=1` links only.

## Editing

`~/.claude` links into this checkout's working tree, so whatever branch it has checked out is live in every session. Keep `~/Develop/agent-config` on `main` and pull after each merge. Make changes in a sibling worktree, one per branch:

```bash
git -C ~/Develop/agent-config worktree add ../agent-config-<branch> -b <branch> main
```

Remove it once the PR merges: `git -C ~/Develop/agent-config worktree remove ../agent-config-<branch>`. A new skill or rule goes live only after its PR merges (rerun `install.sh` for a new skill).

## Scope

- Here: rules that apply to every project, skills written by me.
- Not here: third-party skills (install via their own tooling so they keep updating), project-specific rules (live in each repo's `CODING_STANDARDS.md` / `CLAUDE.md`).
- Add a skill once a workflow has repeated 3+ times or the agent needed the same correction twice.
- Add a tool to `tools/` only if it should be on in every project; per-project tools go in that repo's `.mcp.json`.
