# CI workflows

The reusable workflows consumer repos call, and the scripts behind them. Which reviewer a PR gets: [review.md](review.md).

## Reusable CI

`.github/workflows/ci-typescript.yml` is a reusable workflow running every shared check (format, lint, depcruise, typecheck, knip, `repo-checks all`, gitleaks, unit/integration/e2e); caller examples in its header.

## Agent review and gate

`pr-review.yml` adds the agent review and gate (transcript kept as an artifact). While the CI Claude token is at its session limit, the review run fails and names the limit and reset time (`review-rate-limit`, bin, reads the transcript; one PR comment per reset window). The gate stays blocked until the review re-runs after the reset (push, or re-run the failed job). The documented override is `/approve` by the repo owner, for a PR a human reviewed during the outage.

## Merge and upkeep

`auto-merge.yml` merges PRs labelled `automerge` once green and current; `pr-upkeep.yml` regenerates generated files on PRs and merges main into PRs that fall behind (both push with a GitHub App token, setup in `/init-repo`).

## Confidence label

`auto-merge.yml` also runs a `confidence` job after each finished PR workflow: `pr-confidence label-sha` sets one of `confidence-high`, `confidence-medium`, `confidence-low` from facts on the PR (failing checks and an open blocking review force low; high must be earned by proof: the agent review ends its summary with `proof: sufficient sha=<head>` or `proof: insufficient sha=<head>` plus the unproven claims, and `pr-confidence` reads it from a bot comment for the current head commit only, so a missing, stale or insufficient verdict caps the tier at medium; a push that leaves the diff unchanged carries the verdict over (`carry-proof`); otherwise points are taken off for no filled `## Verified` section (-20), no fenced output or screenshot in it on a code change (-10), no review of the final commit, more than 3 reviewed commits, an open `needs-human`, no `## Risks` section (a trivial change says "none" under the heading), ticked risk boxes, size over 400 lines, code changed without a test file, workflow changes), and the factor table goes to one comment on the PR (found by its marker, edited in place, with a note that it is not a probability) and to the run's step summary. A push sets `confidence-pending` straight away (a step in `pr-review`'s review job), so a new commit never shows the previous commit's tier. The label gates auto-merge: `pr-automation` merges an `automerge` PR only at `confidence-high` with no `needs-human` (`human-approved` stands for a human read and waives the tier). Otherwise it leaves one comment (marker `gate:automerge-confidence`, edited in place) naming the tier or `needs-human`. The `evaluate` job `needs: confidence` and reads the labels after it, so the decision follows the label of the same run; `pending` wins over a stale `high`, and a PR reaching `confidence-high` merges on that run without a human re-trigger. agent-config labels its own PRs the same way through `.github/workflows/confidence.yml` (the built-in token, default-branch code only). `pr-confidence calibrate` scores recent merged PRs and counts reverts per tier, to check the weights against what happened.

## Reports

`ci-report` (bin) shows where a repo's Actions minutes go.

## Wiring a repo

`/init-repo` (skill) copies `skills/init-repo/templates/typescript/` into a new or existing repo and wires all of the above; `skills/init-repo/CHANGELOG.md` lists the template changes an already-wired repo applies by hand. `pnpm test` runs a violating fixture per rule plus a clean control.

## Action pinning

Third-party actions in these workflows are pinned to full commit SHAs with the release in a trailing comment (`uses: actions/checkout@<sha> # v7.0.1`), GitHub-owned ones included; `.github/dependabot.yml` (`github-actions`, weekly) opens the bump PRs. The `k-b3r/agent-config/...@main` calls in consumer repos are deliberately not pinned, so a fix here reaches every repo at once (the trade-off: a bad push to `main` does too). GitHub can reject unpinned actions with the setting "Require actions to be pinned to a full-length commit SHA" (Settings > Actions > General; REST `sha_pinning_required`); it is off here and this repo does not enable it. When a repo turns it on, GitHub docs say reusable workflows can still be referenced by tag; a branch ref like `@main` is not verified.
