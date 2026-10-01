# agent-config

Personal Claude Code setup: global instructions, general coding standards, own skills.

```
CLAUDE.md            -> ~/.claude/CLAUDE.md (imports CODING_STANDARDS.md)
CODING_STANDARDS.md  -> ~/.claude/CODING_STANDARDS.md
skills/<name>/       -> ~/.claude/skills/<name>
```

## Install

```bash
git clone git@github.com:k-b3r/agent-config.git ~/Develop/agent-config
~/Develop/agent-config/install.sh
```

Symlinks only. Existing non-linked files are moved to `~/.claude/backup-<timestamp>/`. Rerun after adding a skill.

## Scope

- Here: rules that apply to every project, skills written by me.
- Not here: third-party skills (install via their own tooling so they keep updating), project-specific rules (live in each repo's `CODING_STANDARDS.md` / `CLAUDE.md`).
- Add a skill once a workflow has repeated 3+ times or the agent needed the same correction twice.
