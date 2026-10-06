---
name: dispatch-tickets
description: Orchestrator side of delegated ticket work. Hands tracker tickets to background agents that each load /ship-ticket, keeps a progress file so a compacted or new session doesn't relaunch finished work, verifies each PR against its report, relays cross-PR notes, files reported findings, and moves PRs toward merge. Use when user runs /dispatch-tickets, asks to "ship these tickets", "run a round", "delegate BUY-41 and BUY-42 to agents", or hands over several tickets to implement as PRs.
---

# Dispatch tickets

You orchestrate; agents implement. Each agent takes one ticket to a ready PR via `/ship-ticket` and ends with its fixed report. Your job: scope, launch, verify, relay, file, merge path. Never implement a ticket yourself in the same session.

Input: ticket ids (or plan rows / a file that holds the ticket bodies).

## 0. Progress file

`<git-common-dir>/dispatch/<round>.md` (`git rev-parse --git-common-dir`; inside `.git`, so never committed, shared by all worktrees). `<round>` is the date plus a slug. One row per ticket:

```
| ticket | agent | branch | PR | status | findings filed |
| BUY-41 | a1b2 | buy-41-retry-cap | #36 | report verified | BUY-48 |
```

Statuses: `scoped`, `running`, `reported`, `report verified`, `awaiting human`, `automerge`, `merged`, `failed: <why>`. Update a row on every change. After compaction or in a new session, trust this file plus `gh pr list` and `git worktree list` over your memory.

## 1. Prepare

- Check what's live before planning: tracker tools loaded and on the project's workspace (e.g. Linear `get_workspace`), `gh` on the right account. Missing or wrong workspace: say so; take ticket bodies from the plan or a file instead, and queue tracker writes in the outbox (CODING_STANDARDS.md tracker rule).
- Look for leftovers: `git worktree list`, open PRs and pushed branches for these tickets. A ticket with a branch or PR already is a resume, not a new launch.
- Read every ticket. Give each a **file scope** (paths it owns); scopes must not overlap. Two tickets that need the same file: run them one after another, or name the owner and write the contract for the other (import direction, function signature) as a cross-PR note.
- Unclear scope or acceptance: ask the user now. Don't let an agent guess.
- Show the user the plan (ticket, scope, parallel or sequential) and launch on their go.

## 2. Launch

One background agent per ticket, `isolation: "worktree"`. The prompt carries only:

```
Load /ship-ticket. Ticket: BUY-41 <title>
Body: <ticket body, or where to read it>
File scope: src/modules/pricing/, tests/integration/pricing.test.ts
Cross-PR: BUY-42 owns src/platform/settings.ts; read SETTING_DEFAULTS from it, don't edit it.
```

Repo rules come from `CODING_STANDARDS.md` and the skill; don't paste them. Mark the row `running`.

## 3. On each report: verify, don't trust

An agent's "done" is a claim. Check before marking `report verified`:
- PR exists, is ready (not draft), title and `Closes <TICKET>` are right.
- `gh pr diff <pr> --name-only` stays inside the file scope; anything outside is a finding or a scope miss.
- `gh pr checks <pr>`: green, or the report says what's red and why.
- The decisions it lists match the ticket. A decision the ticket didn't cover goes to the user.

Mismatch: send it back to the agent (SendMessage) or mark `failed` and tell the user.

Cross-PR notes in the report: relay them to the affected running agents right away.

## 4. File what the agents found

- `[sizable]` findings: ticket them now in the repo's tracker (outbox if it's unreachable); link the source PR.
- `[small]`: append to the held-findings list the repo names (see `/ticket-held-findings`), with date and source.
- `Friction`: pass it to the user as candidate improvements to the agent setup; don't fix tooling mid-round.

Record filed ids in the row.

## 5. Merge path

- `needs-human` on the PR: mark `awaiting human`; at the end, offer `/resolve-needs-human`.
- `agent-changes-requested`: send the agent back to `/address-pr-review`, or do it yourself after the round.
- Verified and green: add `automerge` (allowed here because you read the report and the diff). Never merge directly. First route the review summary's non-blocking items like `[small]` findings; once merged, nobody reads them.

## 6. Close the round

- After each merge: check the ticket closed itself (tracker's GitHub integration via `Closes <id>`); set it Done only if it didn't. Remove that agent's worktree and local branch (`git worktree remove`, `git branch -d`); skip any that are locked or have unpushed commits, and tell the user.
- Report from the progress file:

```
Round 2026-10-06-pricing: 3 tickets
BUY-41 #36 merged          BUY-42 #37 automerge (CI running)
BUY-43 #38 awaiting human: retry cap on paid API
Filed: BUY-48, BUY-49   Held: 2 small   Friction: vitest EACCES in sandbox (twice)
```
