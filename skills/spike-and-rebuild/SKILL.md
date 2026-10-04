---
name: spike-and-rebuild
description: Plans a feature as committed data structures, invariants, interface stubs, and a touch-point list, builds a throwaway spike against it, has a fresh-context reviewer compare spike to plan from git evidence, then rebuilds properly with TDD. Use when user runs /spike-and-rebuild, or starts a new feature whose shape is unclear (new data model, several modules, unknown APIs). Skip for bug fixes and small changes.
---

# spike-and-rebuild

Plan, spike, compare against the plan from evidence, revise, rebuild. The spike's job is to expose what the plan got wrong; the comparison is the product, the spike code is thrown away.

Feature folder: `docs/spikes/<feature>/` (kebab-case name). Templates: [TEMPLATE.md](TEMPLATE.md). Reviewer prompt: [REVIEW_PROMPT.md](REVIEW_PROMPT.md). Skip this skill for bug fixes and changes touching 1-2 files; say so and use plain TDD.

Plan SHA, wherever a step needs it: `git log -1 --format=%H --grep='^plan <feature>$'`.

## Workflow

Three **Gates** need the user; everything else runs without them.

1. **Plan.** **Gate:** agree data structures + invariants with the user before writing stubs.
   - `PLAN.md` sections 1-2: data structures, invariants. Invariants shape types (status enum, not two booleans).
   - Interfaces as real code stubs in their final locations: types plus signatures whose bodies throw `not implemented`. Stubs must typecheck. `PLAN.md` section 3 lists them.
   - `TODO.md`: one bullet per file to change, path first (`` - `src/x.ts`: why ``). A folder ending in `/` covers new files under it.
   - Commit on the feature branch: `plan <feature>`. This commit is the baseline the spike is measured against.
2. **Spike** in a throwaway worktree, time-boxed (agree the box with the user, default one session):
   `git worktree add ../<repo>-spike-<feature> -b spike/<feature> <plan-sha>`
   Quick and dirty is the point. Every shortcut gets an inline `SPIKE-HACK: <what, why>` comment (`//` or `#`) at the moment it's taken. Commit as you go; tests optional.
3. **Review.** **Gate:** show the user the REVIEW.md "Plan changes" section and get a yes.
   - Spawn a subagent (clean context, never the spike author) with [REVIEW_PROMPT.md](REVIEW_PROMPT.md) filled in. It generates `evidence.md` from git, then writes `REVIEW.md`. The spike author may add a `Spike author notes` section after it, but never edits the reviewer's entries.
   - Every `[ ]` in `evidence.md` must map to a REVIEW.md entry. Unmapped item: send it back to the reviewer.
4. **Revise** stubs, `PLAN.md`, `TODO.md` per the approved plan changes. The plan must stand alone, since the builder never reads REVIEW.md: each hack's "real build must do instead" lands in `PLAN.md` or `TODO.md`, and approved preparatory refactors go in `TODO.md` > Before, in order. Commit: `revise plan <feature>`. Then `git worktree remove ../<repo>-spike-<feature>` and delete `spike/<feature>`; keep `docs/spikes/<feature>/`.
5. **Hand off.** **Gate:** the user reads `PLAN.md` + `TODO.md` at the `revise plan` commit (exactly what the builder gets) and confirms the feature could be built from them alone. End the session with:
   - a checklist mapping each REVIEW.md plan change to where it landed (`PLAN.md` section, `TODO.md` line, or stub file);
   - the prompt for a new session: `Build <feature> per docs/spikes/<f>/PLAN.md and TODO.md (/spike-and-rebuild phase 6).`
6. **Build** in a fresh session. Read only `PLAN.md`, `TODO.md`, and the stubs; never `REVIEW.md`, `evidence.md`, or the spike. Plan unclear or wrong: stop and ask, then fix the plan.
   - **6a. Preparatory refactors** (`TODO.md` > Before) first: behavior-preserving only, one commit each, tests green after each; thin coverage gets characterization tests first. A refactor that crosses a module boundary is its own PR (its own fresh session), merged before the feature.
   - **6b. Feature, TDD.** Each invariant first becomes a failing test, then each interface stub gets its tests, then implementation. Normal coding standards apply; no `SPIKE-HACK` may survive (grep before each commit).

## Rules

- The spike never merges, not even "the good parts". Rewrite them in phase 6.
- The builder's context is the plan, nothing else. A gap the builder hits is a phase 4 bug: fix the plan, don't dig through the review.
- The spike author never writes the verdict. The reviewer gets plan, evidence, and spike diff only, not the spike conversation.
- No adjectives in REVIEW.md ("minor", "mostly", "slightly"): state what changed and why.
- "None" in a REVIEW.md section needs the evidence line that shows it (e.g. "evidence.md: Stub changes: none").
- If the spike shows the plan is wrong at the data-structure level, stop after phase 3 and redo phase 1 with the user before spiking again.
