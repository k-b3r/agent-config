# Testing: examples

Rules live in `CODING_STANDARDS.md` → Testing. Snippets are TypeScript/Vitest for illustration.

## Inject dependencies as params

Don't: a hidden singleton the test can't replace.
```ts
import { db } from '../db'
export async function markShipped(id: string) { await db.query(...) }
```

Do:
```ts
export async function markShipped(db: DbClient, id: string): Promise<void>
```

## Minimal interfaces, tiny fakes

```ts
export interface DbClient {
  query(sql: string, params: unknown[]): Promise<unknown>
}

const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
```

## Injectable delay

```ts
export async function runWithRetry(fn: () => Promise<T>, delay: DelayFn = realDelay) { ... }

await runWithRetry(fn, async () => {}) // test: no real sleeping
```

## Test names are sentences about behavior

Don't: `'test loadSettings 2'`, `'handles error'`

Do: `'loadSettings falls back to defaults for a key missing from the table'`

## Assert on the query when the query is the contract

```ts
expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE key = ANY($1)'), [['a', 'b']])
```

## Integration tests use a test-only database

```ts
// TEST_DATABASE_URL, never DATABASE_URL: local .env files point the latter at prod.
const pool = createDbPool(testDatabaseUrl())
```

## Contract tests, written blind

Two levels of TDD, for features that went through `/spike-and-rebuild`:

| Level | Author | Sees | Editable by the implementer |
|---|---|---|---|
| Contract (`foo.contract.test.ts`) | Fresh-context agent, before the implementation | stubs, doc comments, plan data structures and invariants | No |
| Unit (`foo.test.ts`) | The implementer, during red-green-refactor | everything | Yes |

The author works in a worktree at the `revise plan` commit, where every stub body throws, so the implementation does not exist to be copied. The contract tests start red for the right reason.

Don't: a contract that lives only in the head of whoever wrote the code.
```ts
// the test author cannot know which keys this reads
export function toPriceReview(r: Record<string, unknown>): ListingPriceReview | null
```

Do: the doc comment names the input shape and the edge cases.
```ts
// Reads price_review_is_negotiable, price_review_low and price_review_high from the
// joined row; a null or undefined is_negotiable means no review row exists.
export function toPriceReview(r: Record<string, unknown>): ListingPriceReview | null
```

A failing contract test is either a wrong test or a missing sentence in the contract. Fix the comment first, then the author fixes the test. The implementer never edits it.

Evidence, 2026-10-15 (k-b3r/buy-and-sell, `src/modules/pricing`: `clean-median`, `price-rules`, `repost`; Stryker 10 with the Vitest runner, a fresh Sonnet agent as author):

| Suite | Tests | Mutation score |
|---|---|---|
| Existing tests | many (also covered indirectly) | 84.3% (229 mutants, 80 s) |
| Blind contract tests alone | 86 | 85.2% |
| Both | | 90.0% |

The 86 blind tests passed on the real code except two, both from an undocumented input shape (above). 13 mutants were killed only by the blind tests, 11 only by the existing ones, 23 by neither. Blind scored lower on `repost.ts` (90.9% vs 95.5%) where the contract did not pin the exact SQL, and on `isPlaceholderPrice`, whose rule lived on a private constant's comment, not on the export.

## Mutation report

Don't: chase 100%. Equivalent mutants (a change with no observable effect) never die.

Do: read the survivors of the files a PR changed, and add the assertion each one shows is missing.
```
[Survived] ConditionalExpression  src/modules/pricing/clean-median.ts:88
-  rawPrices.filter((p): p is number => p !== null && !isJunkPrice(p))
+  rawPrices.filter((p): p is number => true && !isJunkPrice(p))
```
A test with a `null` price in the sample that expects it dropped kills this one.
