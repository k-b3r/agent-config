# Naming and Comments: examples

Rules live in `CODING_STANDARDS.md` → Writing Code → Naming and Comments.

## A better name instead of a *what* comment

Don't:
```ts
// check if the order ships within the free-shipping zone
if (distanceKm(order.address, WAREHOUSE) <= 80) { ... }
```

Do:
```ts
if (isInFreeShippingZone(order)) { ... }
```

## Comment the *why*

Don't:
```ts
// increment attempts
attempts++
```

Do:
```ts
// Payment API 503s cluster for a few minutes; under 3 retries we gave up on runs that would have recovered.
const MAX_ATTEMPTS = 5
```

## Evidence and date for choices from live observation

```ts
// Confirmed live 2026-09-24: the supplier API rate-limits after ~40 rapid requests. Keep pacing above this.
const MIN_REQUEST_DELAY_MS = 4000
```

## Cross-reference instead of re-explaining

```ts
// Skips orders already invoiced: same rule as the nightly backfill.
```

## Interface contracts belong in comments

What the code can't say: preconditions, units, what null means, side effects.
```ts
// Returns null when the order was deleted upstream (not an error).
// Never throws on network failure: logs and returns the stale row instead.
export async function refreshOrder(id: string): Promise<Order | null>
```

## No comments on obvious code

Don't:
```ts
// return the result
return result
```
