---
name: project-start
description: Session orientation skill that reads git state, open PRs with CI status, open issues, handoff notes, and docs to produce a "here's where you are" brief for any codebase. Use when user starts a new session, says "orient me", "where were we", "project start", "catch me up", or invokes /project-start.
---

# Project Start

On invoke, gather context silently then output one structured brief. No questions, no preamble.

CLAUDE.md files and auto-memory (`~/.claude/projects/<project>/memory/`) are already in context at session start. Use them for Key context; don't re-read them.

## Steps

### 1. Git state
```bash
git branch --show-current
git log --oneline -10
git status --short
git log @{u}.. --oneline 2>/dev/null || echo "(no upstream)"
git worktree list
```

### 2. Pull requests and CI
```bash
gh pr status 2>/dev/null || echo "(no gh / not a GitHub repo)"
```
For each open PR this shows, note failing or pending checks. For a failing one, get the failed job names:
```bash
gh pr checks <number>
```

### 3. Open issues
```bash
gh issue list --limit 10 2>/dev/null
```

### 4. Handoff notes, read whichever exist
Files a previous session left for the next one, at repo root: `SESSION_RESUME.md`, `HANDOFF.md`, `NEXT_STEPS.md`, `TODO.md`. These usually say more about "where we left off" than commits do; read them in full.

### 5. Docs, skim whichever exist
- `README.md`
- `CHANGELOG.md` or `CHANGELOG` (latest entries only)
- `docs/`: list files, read any named `architecture`, `adr`, `decisions`, `overview`

## Output format

Produce exactly this structure, skipping empty sections:

```
## Where we left off
[Last 3–5 commits in plain English, plus what handoff notes say was next.]

## In progress
[Uncommitted changes, other worktrees with work, WIP. If clean, say "Working tree clean."]

## Unpushed
[Commits not yet pushed. If none, omit section.]

## Pull requests
[Open PRs with CI state; name failing checks. If none, omit section.]

## Open issues
[Numbered list of open issues. If none or no tracker, omit section.]

## Key context
[1–3 bullets from handoff notes, docs, or memory that matter most right now.
 Skip if they add nothing beyond what git already shows.]
```

No other sections. No headers beyond these. After the brief, stop. Let the user give the next instruction.
