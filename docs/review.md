# Agent review

How a PR gets its reviewer, and how the review prompt is tested. The workflow that runs it: [ci.md](ci.md#agent-review-and-gate).

## Review tier

Two reviewers, picked by the diff, not by either model. `repo-checks review-tier <base>` prints `claude` when the PR does anything a mistake would make hard to undo: it deletes a file, touches a migration path, adds a `DELETE FROM` / `UPDATE ... SET` / `ALTER TABLE` / `DROP ...` / `TRUNCATE`, changes a file under `agentConfig.claudeReviewPaths` (default `src/modules/*/domain/**` and `src/modules/*/store.ts`, the decisions and the writes), ticks a risk box in the PR body, or carries the label `review-opus`. Everything else gets `deepseek`. The PR body and the label can escalate but never downgrade, and a `claudeReviewPaths` glob list that matches no tracked file warns, so a flat repo cannot send its logic to the cheap reviewer by accident. Labels and body reach the classifier as `REVIEW_PR_LABELS` and `REVIEW_PR_BODY`.

`pr-review.yml` runs it first (the `agent-config` checkout's copy, from the caller's cwd and `package.json`; if it fails the PR goes to Claude) and `review-route pick` turns the tier into a model:

| tier | `OPENCODE_API_KEY` | reviewer | if it fails |
|---|---|---|---|
| deepseek | set | DeepSeek (`deepseek-model`, via opencode-go) | job fails, gate blocked |
| deepseek | missing | Claude (note in the step summary) | job fails |
| claude | set | Claude | session limit or start-up error before any tool call or post: rerun on DeepSeek, no PR comment (step summary line), marker `reviewer: deepseek-fallback sha=<head>`; any other error fails the job |
| claude | missing | Claude | job fails (rate-limit comment as before) |
| any | set, and no `CLAUDE_CODE_OAUTH_TOKEN` | DeepSeek (note in the step summary; a repo with no Claude subscription, e.g. agent-config itself) | job fails, gate blocked |

DeepSeek runs through the same `claude-code-action`, prompt and tools, pointed at opencode-go's Anthropic-compatible endpoint (`ANTHROPIC_BASE_URL=https://opencode.ai/inference/go/anthropic`, key in `OPENCODE_API_KEY`). The fallback is decided by `review-route fallback` from the failed transcript (`fallbackDecision`); it never reruns once Claude has commented or edited a label, so a review is not posted twice. A claude-tier PR that the fallback reviewed is capped at `confidence-medium` (`pr-confidence`, factor `reviewer`), so a human decides; a push that leaves the diff unchanged carries the marker with the proof verdict. If DeepSeek also fails, the job fails and the gate stays blocked; a rate-limit comment is posted as before.

## Review seeds

`review-seeds` (bin) is the regression suite for the agent review prompt. Each seed under `review-seeds/seeds/` is a small change to the clean project in `review-seeds/base/` that breaks one standard (or, for a control, none); the script builds them into a throwaway git repo, replays each through `pr-review.yml`'s prompt with `claude -p`, and checks the verdict. Format and how to write a seed: `review-seeds/README.md`. Run it before and after any prompt or standards change (`--workflow` tests an unmerged edit, `--repeat` measures run-to-run variance, `--validate` checks the seeds without a model call; usage: header of `scripts/review-seeds.mjs`). `review-seed-gaps` (bin) lists the judgment rules of `CODING_STANDARDS.md` that no seed covers; `review-seeds/uncovered.json` excuses the ones not worth a seed, with a reason. A new `review` rule gets a seed in the same PR.

## Proof check

The review prompt checks every claim in the PR body (Intent, Changed, each `## Agreed decisions` item) for evidence a reader can check: a test that fails without a behavior change, a reproducing test for a bug fix, pasted output or a screenshot for the rest, a short "docs only" statement for docs or config PRs. Its verdict is the closing `proof:` line of the summary comment (format and who reads it: [ci.md](ci.md#confidence-label)). Unproven claims cap confidence at medium, so a human reviews; an Agreed-decisions item the diff contradicts blocks. Seeds: `proof-claim-without-evidence`, `agreed-decision-contradicted`, `clean-proven-behavior-change`.

## This repo's own PRs

agent-config's own PRs get no agent review, by design: its `pr-review.yml` is `workflow_call`-only and nothing in this repo calls it, so a human reviews them. Consumer repos get the agent review and gate; the review prompt is regression-tested by `review-seeds` instead.
