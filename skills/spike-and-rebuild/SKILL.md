---
name: spike-and-rebuild
description: Plans a feature as committed data structures, invariants, interface stubs, and a touch-point list, builds a throwaway spike against it, has a fresh-context reviewer compare spike to plan from git evidence, then rebuilds properly with TDD. Use when user runs /spike-and-rebuild, or starts a new feature whose shape is unclear (new data model, several modules, unknown APIs). Skip for bug fixes and small changes.
---

# spike-and-rebuild

Plan, spike, compare against the plan from evidence, revise, rebuild. The spike's job is to expose what the plan got wrong; the comparison is the product, the spike code is thrown away.

Feature folder: `docs/spikes/<feature>/` (kebab-case name). Templates: [TEMPLATE.md](TEMPLATE.md). Reviewer prompt: [REVIEW_PROMPT.md](REVIEW_PROMPT.md).

## Workflow

1. **Size check.** Bug fix or change touching 1-2 files: say so and skip this skill. Otherwise continue.
2. **Data structures + invariants.** Write `PLAN.md` sections 1-2. Invariants shape types (status enum, not two booleans). Agree with the user before moving on.
3. **Interfaces.** Write them as real code stubs in their final locations: types plus signatures whose bodies throw `not implemented`. Stubs must typecheck. `PLAN.md` section 3 lists them.
4. **Touch points.** `TODO.md`: one bullet per file to change, path first (`` - `src/x.ts`: why ``). A folder ending in `/` covers new files under it.
5. **Commit the plan** on the feature branch: `plan <feature>`. Record its SHA in `PLAN.md`. This commit is the baseline the spike is measured against.
6. **Spike** in a throwaway worktree, time-boxed (agree the box with the user, default one session):
   `git worktree add ../<repo>-spike-<feature> -b spike/<feature> <plan-sha>`
   Quick and dirty is the point. Every shortcut gets an inline `SPIKE-HACK: <what, why>` comment (`//` or `#`) at the moment it's taken. Commit as you go; tests optional.
7. **Evidence.** From the main checkout:
   `node ~/.claude/skills/spike-and-rebuild/scripts/deviations.mjs --feature <f> --base <base> --plan <plan-sha> --spike spike/<f> > docs/spikes/<f>/evidence.md`
8. **Fresh review.** Spawn a subagent (clean context, never the spike author) with [REVIEW_PROMPT.md](REVIEW_PROMPT.md) filled in. It writes `docs/spikes/<f>/REVIEW.md` using the template. The spike author may add a `Spike author notes` section after it, but never edits the reviewer's entries.
9. **Gate.** Every `[ ]` in `evidence.md` must map to a REVIEW.md entry. Unmapped item: send it back to the reviewer. Show the user the REVIEW.md "Plan changes" section and get a yes.
10. **Revise the plan** (stubs, `PLAN.md`, `TODO.md`) per the approved plan changes. Commit: `revise plan <feature>`.
11. **Remove the spike:** `git worktree remove ../<repo>-spike-<feature>` and delete `spike/<feature>`. Keep `docs/spikes/<feature>/`.
12. **Build properly, TDD.** Each invariant first becomes a failing test, then each interface stub gets its tests, then implementation. Normal coding standards apply; no `SPIKE-HACK` may survive (grep before each commit).

## Rules

- The spike never merges, not even "the good parts". Rewrite them in step 12.
- The spike author never writes the verdict. The reviewer gets plan, evidence, and spike diff only, not the spike conversation.
- No adjectives in REVIEW.md ("minor", "mostly", "slightly"): state what changed and why.
- "None" in a REVIEW.md section needs the evidence line that shows it (e.g. "evidence.md: Stub changes: none").
- If the spike shows the plan is wrong at the data-structure level, stop after step 9 and redo steps 2-5 with the user before spiking again.
