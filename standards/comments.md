# Naming and Comments: examples

Rules live in `CODING_STANDARDS.md` → Writing Code → Naming and Comments.

## A better name instead of a *what* comment

Don't:
```ts
// check if the listing is within the service area
if (distanceKm(listing, MANILA) <= 80) { ... }
```

Do:
```ts
if (isInServiceArea(listing)) { ... }
```

## Comment the *why*

Don't:
```ts
// increment attempts
attempts++
```

Do:
```ts
// Groq 503s cluster for a few minutes; under 3 retries we gave up on runs that would have recovered.
const MAX_ATTEMPTS = 5
```

## Evidence and date for choices from live observation

```ts
// Confirmed live 2026-09-24: Facebook soft-walls after ~40 rapid page loads. Keep pacing above this.
const MIN_PAGE_DELAY_MS = 4000
```

## Cross-reference instead of re-explaining

```ts
// Skips listings already priced: same rule as the sub-category backfill.
```

## Interface contracts belong in comments

What the code can't say: preconditions, units, what null means, side effects.
```ts
// Returns null when the listing was removed on Facebook (not an error).
// Never throws on network failure: logs and returns the stale row instead.
export async function refreshListing(id: string): Promise<Listing | null>
```

## No comments on obvious code

Don't:
```ts
// return the result
return result
```
