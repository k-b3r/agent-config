# Templates

## docs/spikes/<feature>/PLAN.md

```md
# <feature>: plan

Plan commit: <sha> (filled in at step 5)

## 1. Data structures
<each type: fields, units, nullability, where it lives (table/file)>

## 2. Invariants
<numbered; each one testable: "a listing is never both sold and active">

## 3. Interfaces
<each stub: file, signature, one line on contract (side effects, failure modes)>

## Out of scope
<what this feature deliberately doesn't do>
```

## docs/spikes/<feature>/TODO.md

```md
# <feature>: touch points

## Before
<added at step 10: approved preparatory refactors, in order; behavior-preserving>
- `src/domains/x/listings.ts`: split query builder out of the upsert

## Touch points
- `src/domains/x/comps.ts`: new comps query
- `db/schema.sql`: comps index
- `src/workers/comps/`: new worker folder
```

## docs/spikes/<feature>/REVIEW.md

Written by the fresh reviewer. Every `[ ]` in evidence.md maps to exactly one entry; cite it as `(evidence: <section> / <item>)`.

```md
# <feature>: spike review

## Changed data structures
- <type.field>: plan said X, spike needed Y because Z (evidence: ...)

## Changed interfaces
- <function>: plan signature -> spike signature, because ... (evidence: ...)

## Touch points the plan missed
- <file>: why the spike needed it (evidence: ...)

## Planned touch points the spike didn't need
- <file>: unnecessary, or skipped by a hack? (evidence: ...)

## Hacks
- <file:line> <marker> [shortcut|prep]: what it avoided; what the real build must do instead (evidence: ...)

## Preparatory refactors
- <existing file>: current shape -> needed shape; behavior-preserving (evidence: <hack or diff line>)

## New invariants found
- <invariant>: what in the spike revealed it

## Plan changes for the real build
1. <concrete edit to PLAN.md / stubs / TODO.md>

## Spike author notes
<optional, added after the review; context only, never edits the entries above>
```
