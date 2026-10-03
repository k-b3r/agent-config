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

## Scope

- Here: rules that apply to every project, skills written by me.
- Not here: third-party skills (install via their own tooling so they keep updating), project-specific rules (live in each repo's `CODING_STANDARDS.md` / `CLAUDE.md`).
- Add a skill once a workflow has repeated 3+ times or the agent needed the same correction twice.
- Add a tool to `tools/` only if it should be on in every project; per-project tools go in that repo's `.mcp.json`.
