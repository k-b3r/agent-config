# Design: examples

Rules live in `CODING_STANDARDS.md` → Design. Snippets are TypeScript for illustration; the rules are language-agnostic.

## Deep modules

Don't: a shallow wrapper. Its interface is as big as what it hides.
```ts
class ListingRepo {
  get(id: string) { return this.db.query('SELECT * FROM listings WHERE id = $1', [id]) }
}
```

Do: a small interface over real work (query, row mapping, missing-row handling).
```ts
export async function getListing(db: DbClient, id: string): Promise<Listing | null>
```

## Deep modules over many small functions

Don't: split a function into one-use pieces just to make it shorter. The reader now jumps between five places to follow one idea.
```ts
function parseListing(raw) { return { title: getTitle(raw), price: getPrice(raw), city: getCity(raw) } }
function getTitle(raw) { return raw.title?.trim() ?? '' }
function getPrice(raw) { return Number(raw.price) }
```

Do: keep it whole; extract only a piece that is a coherent abstraction of its own.
```ts
function parseListing(raw: RawListing): Listing {
  return {
    title: raw.title?.trim() ?? '',
    price: parsePrice(raw.price), // its own abstraction: currencies, "₱12k", "negotiable"
    city: raw.location?.city ?? null,
  }
}
```

## Hide information

Don't: callers know the storage format.
```ts
const cursor = JSON.parse(page.end_cursor).pg // every caller decodes the cursor
```

Do: the module owns the format; callers get meaning.
```ts
const { nextCursor, hasNextPage } = parsePaginationResponse(json)
```

## Pull complexity downward

Don't: every caller handles paging.
```ts
let cursor = null
do { const page = await fetchPage(cursor); all.push(...page.items); cursor = page.next } while (cursor)
```

Do: the module absorbs it once.
```ts
const all = await fetchAllPages(query)
```

## Define errors out of existence

Don't: an API that throws on a normal case, so every caller wraps it.
```ts
deleteListing(id) // throws if already gone
```

Do: semantics that cover the case.
```ts
deleteListing(id) // idempotent: "make sure it's gone", no-op if absent
search(q)         // no matches → [], never null or an error
```

## Design it twice

Before committing to an interface, sketch one alternative and pick deliberately:
```ts
// A: caller drives       refreshListing(id), then caller updates the price history
// B: module owns it      refreshListing(id) updates listing + history atomically
// B wins: one place to get the transaction right, callers can't forget the history.
```

## Minimize parameters

Don't: make the caller pass what the function can derive.
```ts
availableVacation(employee, employee.grade)
```

Do: derive it from what was passed.
```ts
availableVacation(employee) // reads employee.grade inside
```

Don't: cut parameters by reaching for ambient state.
```ts
function markSold(id: string) {
  const db = createDbPool(process.env.DATABASE_URL!) // hidden dependency, untestable
}
```

Do: inject the outside world, derive the rest, including through injected deps.
```ts
async function refreshPrice(deps: { db: DbClient; llm: LlmClient }, listing: Listing) {
  const area = listing.floorAreaSqm // derived from the entity
  const settings = await loadSettings(deps.db, ['price.max_age_days']) // derived via an injected dep
}
```

Whole object vs single value:
```ts
refreshPrice(deps, listing) // works on the listing entity: pass the whole object
parsePrice(listing.priceText) // small utility: pass only what it needs, not the Listing type
```

Don't: hide a long list in an options bag. `f({ a, b, c, d, e, f })` still has six parameters.
Group only values that belong together, like a deps object.

## Gate new behavior

```ts
// Defaults to today's behavior; the operator turns it on.
if (settings['collect.re_keywords_enabled'] === 1) await collectRealEstateKeywords()
```

## Structure: entry points wire, domains decide

```ts
// worker/index.ts: wiring and loop only
const db = createDbPool(env.DATABASE_URL)
while (true) {
  await runProductExtraction({ db, logger, llm, delay })
  await delay(LOOP_DELAY_MS)
}
// domains/extraction.ts holds every decision runProductExtraction makes
```
