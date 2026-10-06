---
name: session-handoff
description: Rewrites the repo's SESSION_RESUME.md handoff doc so a fresh session can pick up the work, then opens a new Claude session in a Herdr pane with the continue prompt typed but not sent, so the user starts it by pressing Enter. Use when user runs /session-handoff, says "update the handoff", "update SESSION_RESUME", "write the resume doc", "hand off to a new session", "continue in a fresh session", or context is getting long and work should move to a new agent.
---

# Session handoff

Two parts: rewrite the doc, then open the next session. The user approves the new session; this one never starts it.

## 1. Rewrite SESSION_RESUME.md

**Root:** the worktree of the branch the work is on (where its commits and PR live), or the session's own cwd when no branch is in progress. Doc and new pane both go there. Read the current doc first if it exists.

- **Local only.** Unless git already tracks it, make sure `SESSION_RESUME.md` is in `.git/info/exclude` (`git rev-parse --git-path info/exclude`; append only if missing; Claude Code asks approval for that file, don't route around it). Never commit it.
- **Rewrite, don't append.** Done items, strikethroughs and notes that git, PRs or the tracker already record go. Keep only what the next session can't rediscover.
- **Check before writing.** Every PR, CI, branch and worktree state in the doc comes from a live look (`git status`, `git worktree list`, `gh pr list`/`gh pr checks`), not memory.
- **Absolute dates**, never "today" or "yesterday". **Absolute paths** for worktrees and other repos; a relative path resolves against whatever cwd the next session has.
- Out-of-scope findings become tickets per CODING_STANDARDS.md, not doc lines. The doc may link the ticket.
- Under ~60 lines. Exactly this shape, empty sections dropped:

```markdown
# Session resume: <topic>

Local handoff, in `.git/info/exclude`; do not commit. Last updated: <YYYY-MM-DD>.

## Goal
<1-3 lines: what the work is and why>

## State
<PRs, branches, worktrees, CI, as checked just now; a table if several>

## Next steps
1. <first concrete action, with the command or file it starts from>

## Waiting on user
- <decisions or approvals only the user can give; the next session asks, never assumes>

## Decisions
- <choices made and why, so they aren't relitigated>

## Gotchas
- <env quirks, auth switches, commands that fail and the working form>
```

## 2. Open the next session (Herdr)

`test "${HERDR_ENV:-}" = 1` fails: skip to step 3's fallback.

```bash
root=$(git -C "<root from step 1>" rev-parse --show-toplevel)
name="resume-$(date +%H%M%S)"
width=$(herdr pane layout --pane "$HERDR_PANE_ID" | jq '.result.layout.panes[]|select(.pane_id==env.HERDR_PANE_ID).rect.width')
dir=$([ "$width" -ge 160 ] && echo right || echo down)
pane=$(herdr pane split --current --direction "$dir" --cwd "$root" --no-focus | jq -r .result.pane.pane_id)
herdr agent start "$name" --kind claude --pane "$pane" --timeout 60000
```

- `agent_not_ready` (blocked at startup, usually the folder-trust dialog): never answer it. Tell the user to answer it in the new pane, then `herdr agent wait "$name" --until idle --timeout 300000`.
- Once idle, type the prompt without Enter:

```bash
herdr pane send-text "$pane" "Read SESSION_RESUME.md in full and continue from its Next steps. Ask me about anything under Waiting on user."
herdr agent focus "$name"
```

Never `herdr agent prompt`, `send-keys Enter`, or `pane run` here: each submits. One line only; a newline submits too.

## 3. Stop

Report, then stop working in this session so two agents don't touch the same branch.

```
session-handoff: SESSION_RESUME.md rewritten (<n> lines), <k> next steps
New session: pane <pane> (<name>), prompt typed, press Enter there to start
Still running: <background agents of this session, or "none">
```

Background agents stop when this session closes (transcripts and pushed branches survive), so name every one still running.

Not in Herdr: replace the second line with the command for the user to run in a new terminal in the root from step 1:
`claude "Read SESSION_RESUME.md in full and continue from its Next steps. Ask me about anything under Waiting on user."`
