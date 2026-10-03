---
name: address-pr-review
description: Works through review findings on a GitHub PR end to end. Fetches unresolved review threads and the review summary, verifies each finding against the code, fixes in-scope ones test-first in a worktree on the PR branch, tickets out-of-scope ones, pushes to the same PR, then replies on and resolves each thread. Use when user runs /address-pr-review <pr>, asks to "address review comments", "fix the review findings", "handle the PR feedback", or points at flagged code on a PR.
---

# Address PR Review

Input: a PR number (or URL). Fixes land as new commits on the PR's own branch, never a sub-PR.

Helper (needs `gh`): `node ~/.claude/skills/address-pr-review/scripts/review-threads.mjs`
- `list <pr> [--repo owner/name]`: JSON with `branch`, `labels`, review `summary`, unresolved `threads` (id, path, line, body, earlier replies)
- `close <thread-id> "<reply>" [--keep-open]`: reply on a thread, then resolve it

## 1. Fetch

Run `list <pr>`. Then:
- `needs-human` label without `human-approved`: stop, quote the decision the summary asks for, hand it to the user. Never add `human-approved`.
- Findings in the summary but without an inline thread count too.
- A thread whose replies already answer it: skip it.

## 2. Verify every finding before acting

Read the flagged code yourself. Reviewers overstate (a "crash" that is really a silent skip) and sometimes are wrong. Sort each finding:

| Verdict | When | Action |
|---|---|---|
| **fix** | real, and in code this PR adds or changes, and small | fix here |
| **ticket** | real, but in older code, or a bigger change than the PR's scope | issue on the project's tracker (CLAUDE.md or memory names it, e.g. a Linear board; else `gh issue create`) |
| **reject** | wrong, or conflicts with the PR's intent or the standards | no change |

Blocking findings are always **fix** unless rejected. Show the user the verdict table (finding, verdict, one-line reason) and continue; stop only if a verdict needs their judgment.

## 3. Worktree on the PR branch

```bash
git fetch origin <branch>
git worktree list                     # reuse a worktree already on <branch>
git worktree add .claude/worktrees/<branch> <branch>   # else create one
```
In it: `git pull`, install deps the way the project does (all workspaces, or the pre-push check fails on missing modules).

## 4. Fix, one commit per finding

For each **fix**, test first (red, green): a test that reproduces the finding, then the change. Commit per the repo's commit rules (lowercase imperative subject, no AI attribution). Record each sha against its finding.

## 5. Push

`git push`. The pre-push hook runs the project check; fix what it reports, never `--no-verify`.

## 6. Close out

- **fix**: `close <id> "Fixed in <sha>: <what changed>"`
- **ticket**: `close <id> "Out of scope here, tracked in <link>"`
- **reject**: `close <id> "Not changing: <reason>" --keep-open` (a human resolves it)
- Summary-only findings: one `gh pr comment <pr>` listing each with its outcome.

## 7. Wait for CI and the re-review

`gh pr checks <pr> --watch`. The new commits re-run the review on the full diff.
- New **blocking** finding: one more pass of steps 1-6.
- New non-blocking findings: ticket or reject, don't fix in a loop. Stop after two passes and report.

Don't merge; report and leave it to the user:

```
PR #5: 2 fixed (a1b2c3d, d4e5f6a), 0 ticketed, 0 rejected. CI green, gate passed.
```
