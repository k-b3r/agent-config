---
name: project-start
description: Session orientation skill that reads git state, open issues, docs, and memory to produce a "here's where you are" brief for any codebase. Use when user starts a new session, says "orient me", "where were we", "project start", "catch me up", or invokes /project-start.
---

# Project Start

On invoke, gather context silently then output one structured brief. No questions, no preamble.

## Steps

### 1. Git state
```bash
git branch --show-current
git log --oneline -10
git status --short
git log @{u}.. --oneline 2>/dev/null || echo "(no upstream)"
```

### 2. Open issues
```bash
gh issue list --limit 10 2>/dev/null || echo "(no gh / not a GitHub repo)"
```

### 3. Docs — read whichever exist
- `CLAUDE.md` (project-level)
- `~/.claude/CLAUDE.md` (global)
- `README.md`
- `CHANGELOG.md` or `CHANGELOG`
- `docs/` — list files, read any named `architecture`, `adr`, `decisions`, `overview`
- `.claude/memory/MEMORY.md` — memory index if present

### 4. Memory files
If `.claude/memory/MEMORY.md` exists, read it and any files it references that seem relevant to current work.

## Output format

Produce exactly this structure, skipping empty sections:

```
## Where we left off
[Last 3–5 commits in plain English. What changed.]

## In progress
[Uncommitted changes or WIP. If clean, say "Working tree clean."]

## Unpushed
[Commits not yet pushed. If none, omit section.]

## Open issues
[Numbered list of open issues. If none or no tracker, omit section.]

## Key context
[1–3 bullets from docs/memory that are most relevant to current state.
 Skip if docs add nothing beyond what git already shows.]
```

No other sections. No headers beyond these. After the brief, stop — let the user give the next instruction.
