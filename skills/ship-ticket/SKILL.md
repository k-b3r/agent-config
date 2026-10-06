---
name: ship-ticket
description: Brief for a delegated agent that takes one tracker ticket to a ready pull request. Covers branch and worktree setup, scope rules, working command forms in a sandboxed worktree, commit and PR conventions, keeping current with main, CI follow-up, and the fixed report format. Use when an orchestrating session hands you a ticket (e.g. "ship BUY-42", "use ship-ticket for ABC-7"), or when you are a background agent asked to implement a ticket as a PR.
---

# Ship Ticket

Input from the orchestrator: ticket id, ticket body (or where to read it: tracker, plan row, file), file scope (paths you own), and any cross-PR notes. The repo's `CODING_STANDARDS.md` names the canonical check, the install steps and repo-specific rules; it wins over this brief.

## 1. Set up

- Branch `<ticket-lower>-<slug>` (e.g. `buy-42-delete-utils`). In an auto-named worktree, rename its branch to that.
- Resuming earlier work: check out the pushed branch, don't `reset --hard` onto it.
- Install deps for every workspace the repo has (root and sub-apps). Generators and the pre-push check fail or silently write wrong output without them.
- Read the ticket. If the tracker is not reachable, use the body the orchestrator passed. Unclear scope: report the question instead of guessing.

## 2. Stay in scope

- Change only the paths you own. A file outside your scope only when the fix is wrong without it: check it isn't a path another open PR owns (cross-PR notes); if it is, stop and report. Otherwise edit it and name the file and the reason under Decisions.
- Run formatters on your own paths, not on whole shared folders.
- Bugs, smells and debt found on the way go in the report (step 6), not in the diff.

## 3. Work

- TDD: failing test, change, green. Tests named as full sentences.
- Every commit leaves its targeted tests green. Refactoring and behavior changes go in separate commits.
- Before changing a signature or shared type: `codegraph impact <symbol> --depth 2 -p <main repo>` when the repo is indexed (TOOLS.md), then grep for strings, config and dynamic lookups.
- Stuck after 3 attempts at the same problem: stop and report what failed instead of trying more.
- File changes with Write/Edit, not heredocs or multi-step `sed`. One command per Bash call, `git -C <dir>` instead of `cd <dir> && git`. Sandboxes reject chained and inline-script forms.
- Targeted tests only while iterating (quiet reporter, e.g. `pnpm --dir <dir> exec vitest run --silent --reporter=dot <path>`). Don't run the canonical check or CI's checks by hand: the pre-push hook runs the check, CI runs the rest.
- Regenerate generated files the repo lists (docs, clients); CI can only verify them.
- Fake secrets in tests look obviously fake (`test-key`, `xxx`), never shaped like real keys: secret scanning flags them.

## 4. Commit and open the PR early

- Subject: lowercase, imperative, no trailing period, at most 72 chars. No AI attribution.
- After the first commit: push, then open a **draft** PR so the work survives the session.
  - Title: `<subject> (<TICKET>)`, at most ~65 chars (merge titles add a suffix).
  - Body: `Closes <TICKET>`, or `Part of <TICKET>` when the ticket spans several PRs. What changed and why, in a few lines.
- Push output is long: redirect it to a file in your scratchpad, then read the tail and grep for errors.
- Pre-push failed: fix and push again. Never `--no-verify`. Force-push only your own branch, only `--force-with-lease`, only to fix a commit message CI rejected.

## 5. Finish

- `git pull` (CI bots may have added commits), then merge `origin/main` if it moved. Push.
- Mark the PR ready. Watch CI (`gh pr checks <pr> --watch`), fix what fails.
- Never add `automerge` or `human-approved`, never merge. The orchestrator reads your report and decides.

## 6. Report

Fixed sections, short lines, `path:line` references:

```
PR #N (<TICKET>): <one-line result>. CI <green|failing: what>.
Changed: <what, per area>
Decisions: <choices you made that the orchestrator should know>
Cross-PR: <files or contracts other open PRs depend on, or "none">
Findings:
  - [sizable] <path:line> <problem>  -> needs its own ticket
  - [small] <path:line> <problem>    -> fits an existing ticket or a grouped one
Friction: <tool or sandbox problems that cost you time, or "none">
```
