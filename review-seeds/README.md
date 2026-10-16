# Review seeds

Test cases for the agent review in `.github/workflows/pr-review.yml`. Each seed is a small change to `base/` that breaks exactly one standard (or, for a control, breaks none). `scripts/review-seeds.mjs` replays every seed through the review prompt with `claude -p` and checks the verdict.

`base/` is a tiny clean project that follows the standards: modules `catalog` (tier 0) and `pricing` (tier 1), a worker with `index.ts` plus `run.ts`, one route, and `platform/`. Its own `CODING_STANDARDS.md` records the layout. Treat `base/` as read-only when writing seeds; if a seed needs something it lacks, say so in your report, don't edit it.

## Seed format

One directory per seed: `seeds/<name>/`, `<name>` in kebab-case and unique.

```
seeds/<name>/
  seed.json
  files/<path>        # overlay: copied over base/, new paths allowed (single-commit seeds)
  remove.txt          # optional: base paths to delete, one per line
  steps/NN-<slug>/    # instead of files/: one commit per step, applied in order
    message.txt       # commit message for the step
    files/<path>
    remove.txt
```

`seed.json`:

```json
{
  "name": "route-imports-store",
  "rule": "routes call public module functions, never store/",
  "covers": "HTTP routes are entry edges",
  "expect": { "blocking": true },
  "message": "add price lookup to the pricing route",
  "body": "optional PR body"
}
```

- `covers`: a distinctive substring (at least 20 characters) of the standards rule the seed tests, copied from `CODING_STANDARDS.md`. A control uses `"covers": null`.
- `expect.blocking`: should the review add `agent-changes-requested`. `expect.needsHuman`: only when the rule demands a human decision; omit otherwise.
- `message`: commit message for a single-commit seed (lowercase, imperative, no trailing period, at most 72 characters). Multi-step seeds use `steps/*/message.txt`.

## Writing a seed

- Break exactly one rule, the one in `rule`. Everything else in the diff follows the standards and base conventions (named exports, tests beside code, full-sentence test names, injected I/O).
- Keep the change small (under about 40 changed lines) and natural: no comments or names that announce a violation ("bad", "violation", "TODO fix"). Comments say why, as in base.
- A violation the review should find must be visible in the diff or in files the diff touches.
- A control changes something harmless and correct (a rename, a doc fix, a small tested feature that follows every rule) and expects `{ "blocking": false }`.
- Commit-hygiene seeds (one logical change per commit, refactor never shares a commit with behavior) use `steps/`.
