# Resilience: examples

Rules live in `CODING_STANDARDS.md` → Resilience.

## Bounded retry, then degrade

```ts
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 30_000

async function classifyWithRetry(batch: Item[]): Promise<Result[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await classify(batch)
    } catch (err) {
      if (err instanceof QuotaExhaustedError) throw err // fatal: unwind
      logger.warn(`batch of ${batch.length}: attempt ${attempt}/${MAX_ATTEMPTS} failed (${String(err)})`)
      await delay(RETRY_DELAY_MS * attempt)
    }
  }
  // Degrade instead of crashing: retry the halves, so one bad item can't sink the batch.
  if (batch.length > 1) {
    const mid = Math.ceil(batch.length / 2)
    return [...(await classifyWithRetry(batch.slice(0, mid))), ...(await classifyWithRetry(batch.slice(mid)))]
  }
  logger.warn(`item ${batch[0].id}: skipped after ${MAX_ATTEMPTS} attempts, stays a candidate`)
  return []
}
```

## Fatal vs transient

```ts
class QuotaExhaustedError extends Error {} // 429 quota: retrying burns time, stop the run

if (res.status === 429) throw new QuotaExhaustedError(provider)
if (!res.ok) throw new Error(`${provider} ${res.status}`) // anything else is transient: retried
```

## Never lose data silently

Don't:
```ts
const parsed = items.map(tryParse).filter(Boolean) // failures vanish
```

Do:
```ts
for (const item of items) {
  const parsed = tryParse(item)
  if (!parsed) {
    logger.warn(`item ${item.id}: unparseable, left for next run`)
    continue // still a candidate: nothing marked it processed
  }
  await save(parsed)
}
```
