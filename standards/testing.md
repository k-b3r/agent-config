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
