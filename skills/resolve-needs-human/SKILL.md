---
name: resolve-needs-human
description: Walks the user through every open PR labelled `needs-human` (the agent review's "a human must decide" flag), one at a time. For each it pulls the review summary, verifies the open decision against the code, presents it with a recommendation, then acts on the user's call: `/approve`, queue changes, close, or skip. Use when user runs /resolve-needs-human, asks to "go over needs-human PRs", "review PRs waiting on me", "clear the human queue", or which PRs are blocked on a decision.
---

# Resolve needs-human

The agent review in `pr-review.yml` adds `needs-human` when correctness hinges on a judgment it can't verify; the gate fails until `human-approved` is added. Commenting `/approve` (repo owner only) adds it, removes `needs-human` and re-runs the gate. This skill turns that queue into a guided session. The user decides; you prepare and execute.

Input: optional `--repo owner/name` (default: current repo) or PR numbers to limit the queue.

## 1. Queue

```bash
gh pr list --state open --label needs-human --author @me \
  --json number,title,url,labels,isDraft,headRefName
```
Drop PRs that already have `human-approved` (decided, `/approve` just hasn't cleared `needs-human`, e.g. approved by label: remove `needs-human` on those and list them). A PR reappears only if the re-review raises a new decision. Show the queue as one line per PR (`#33 fix llm caller retries (BUY-34)`), oldest first. Empty: say so and stop.

## 2. Per PR, one at a time

Gather (silently):
- `node ~/.claude/skills/address-pr-review/scripts/review-threads.mjs list <pr>`: labels, review summary, unresolved threads
- `gh pr view <pr> --json body,files,statusCheckRollup,mergeable` and `gh pr diff <pr>`
- Linked ticket (from title or body) if the tracker is reachable. "Not found": check the connector's workspace before concluding the ticket is missing.

Find what the summary says the human must decide. Several decisions on one PR: handle each. Then verify: read the flagged code and its callers, check the claim (reviewers overstate and are sometimes wrong). If the "decision" turns out to be checkable from code, say so and settle it.

Present, short:

```
#33 fix llm caller retries and log redaction false positives (BUY-34)
Decide: retry 429s up to 5x with backoff, or fail fast and let the next run pick it up?
Facts: callers are batch workers (src/workers/enrich); a failed item stays a candidate (queries.ts:88). No user waits on it.
Also open: 1 blocking finding (agent-changes-requested), CI red on e2e.
Recommend: approve. Retry cost is bounded, behavior matches the resilience standard.
```

Then ask with AskUserQuestion (recommended option first):
- **Approve**: decision accepted as is
- **Approve + automerge**: also add `automerge` so it merges once green
- **Changes**: user states what to change (free text via Other, or follow-up)
- **Close**: drop the PR
- (Other) skip, or anything else

## 3. Act on the answer

- **Approve**: if the user gave a reason, `gh pr comment <pr> --body "Human decision: <reason>"` first. Then `gh pr comment <pr> --body "/approve"`. Confirm the workflow added `human-approved` and removed `needs-human` (`gh pr view <pr> --json labels`, the workflow also replies "Approved via `/approve`"; give it ~30s). If blocking findings or red CI remain, say the gate still won't pass and add the PR to the fix list.
- **Approve + automerge**: as Approve, then `gh pr edit <pr> --add-label automerge`.
- **Changes**: post `Human decision: <what to change and why>` as a PR comment (it becomes a finding the re-review sees), add to the fix list, move on. Don't fix mid-walk; decisions stay fast.
- **Close**: confirm once (irreversible for the branch's work), then `gh pr close <pr> --comment "<reason>"`. Note the linked ticket for the user (reopen, re-scope, or cancel; ask which).
- **Skip**: leave untouched.

## 4. Fix list

After the walk, for each PR on the fix list ask: fix now in this session, or hand off. Fixing follows `/address-pr-review` with the human decision as a blocking finding (its step 1 stop doesn't apply: the decision is made). After its push, `needs-human` is still on the PR: once the re-review is in, present the PR again (step 2) for the final `/approve`.

## Rules

- `/approve` only after the user's explicit per-PR answer in this session. Never batch-approve, never infer approval from earlier answers or memory.
- Approve through `/approve`, not by editing labels; it keeps the audit trail on the PR. Remove `needs-human` by hand only on a PR a human already approved.
- Never merge. `automerge` only when the user picked it.
- Your `gh` account must be the repo owner, or `/approve` is ignored; if the labels don't change, say so instead of retrying.

## Report

```
#33 approved (automerge)   #30 changes: skip null items earlier, fixed in a1b2c3d, awaiting re-review
#29 closed, BUY-31 reopened   #27 skipped
```
