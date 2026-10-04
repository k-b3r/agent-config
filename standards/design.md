# Design: examples

Rules live in `CODING_STANDARDS.md` → Design. Snippets are TypeScript for illustration; the rules are language-agnostic.

## Deep modules

Don't: a shallow wrapper. Its interface is as big as what it hides.
```ts
class OrderRepo {
  get(id: string) { return this.db.query('SELECT * FROM orders WHERE id = $1', [id]) }
}
```

Do: a small interface over real work (query, row mapping, missing-row handling).
```ts
export async function getOrder(db: DbClient, id: string): Promise<Order | null>
```

## Deep modules over many small functions

Don't: split a function into one-use pieces just to make it shorter. The reader now jumps between five places to follow one idea.
```ts
function parseProduct(raw) { return { name: getName(raw), price: getPrice(raw), category: getCategory(raw) } }
function getName(raw) { return raw.name?.trim() ?? '' }
function getPrice(raw) { return Number(raw.price) }
```

Do: keep it whole; extract only a piece that is a coherent abstraction of its own.
```ts
function parseProduct(raw: RawProduct): Product {
  return {
    name: raw.name?.trim() ?? '',
    price: parseMoney(raw.price), // its own abstraction: currencies, "$12k", "free"
    category: raw.category?.slug ?? null,
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
deleteDraft(id) // throws if already gone
```

Do: semantics that cover the case.
```ts
deleteDraft(id)   // idempotent: "make sure it's gone", no-op if absent
search(q)         // no matches → [], never null or an error
```

## Design it twice

Before committing to an interface, sketch one alternative and pick deliberately:
```ts
// A: caller drives       cancelOrder(id), then caller refunds the payment
// B: module owns it      cancelOrder(id) cancels + refunds atomically
// B wins: one place to get the transaction right, callers can't forget the refund.
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
function markShipped(id: string) {
  const db = createDbPool(process.env.DATABASE_URL!) // hidden dependency, untestable
}
```

Do: inject the outside world, derive the rest, including through injected deps.
```ts
async function quoteShipping(deps: { db: DbClient; carrier: CarrierClient }, order: Order) {
  const weight = order.totalWeightKg // derived from the entity
  const settings = await loadSettings(deps.db, ['shipping.free_threshold']) // derived via an injected dep
}
```

Whole object vs single value:
```ts
quoteShipping(deps, order) // works on the order entity: pass the whole object
parseMoney(order.totalText) // small utility: pass only what it needs, not the Order type
```

Don't: hide a long list in an options bag. `f({ a, b, c, d, e, f })` still has six parameters.
Group only values that belong together, like a deps object.

## Functional core, imperative shell

Don't: decisions tangled with I/O, so testing the rule needs a database.
```ts
async function applyLoyaltyDiscount(db: DbClient, orderId: string) {
  const order = await getOrder(db, orderId)
  if (order.customer.orders >= 10) await db.query('UPDATE orders SET discount = 0.1 WHERE id = $1', [orderId])
}
```

Do: pure core takes data and returns data; the shell does the I/O.
```ts
function loyaltyDiscount(order: Order): number { return order.customer.orders >= 10 ? 0.1 : 0 } // core

const order = await getOrder(db, id)                                                            // shell
await setDiscount(db, id, loyaltyDiscount(order))
```

## Inject only I/O, wire once

Don't: inject pure logic, or resolve deps from a container or event bus.
```ts
function checkout(deps: { db: DbClient; taxCalculator: TaxCalculator }, cart: Cart) // tax math is pure: just import it
container.resolve<PaymentClient>('payments')                                       // hidden wiring
```

Do: deps are the outside world only, built in one composition root per entry point.
```ts
// worker/index.ts: the composition root
const deps = { db: createDbPool(env.DATABASE_URL), payments: createPaymentClient(env.PAYMENTS_KEY), logger, delay: realDelay }
await runInvoiceSync(deps)
```

## Interfaces only at I/O boundaries

Don't: an interface with one implementation, or a class hierarchy for a strategy.
```ts
interface IPriceFormatter { format(n: number): string }
class UsdFormatter implements IPriceFormatter { ... } // the only one
abstract class ShippingRule { abstract cost(o: Order): number }
```

Do: interfaces where I/O can be swapped (and faked in tests); strategies as plain functions.
```ts
interface PaymentClient { charge(amount: number, token: string): Promise<ChargeResult> } // adapter boundary
type ShippingRule = (order: Order) => number
const rules: ShippingRule[] = [flatRate, freeOverThreshold]
```

## Patterns: our form

Reach for one only when the code already has its shape. Simplest form first.

| Pattern | Our form |
|---|---|
| Strategy, Command | function, or array of functions |
| Factory | function returning an object |
| Decorator | higher-order function (`withRetry(fn)`) |
| Adapter | interface at an I/O boundary |
| Repository | deep module functions (`getOrder(db, id)`), no class |
| Observer, pub-sub | explicit call or callback param; no in-process bus |
| Singleton | none: built once in the composition root, injected |
| State machine | discriminated union + pure `transition(state, event)` |

## Idempotent operations

Don't: a rerun after a crash double-charges.
```ts
await payments.charge(order.total, order.paymentToken)
```

Do: safe to retry or rerun.
```ts
await payments.charge(order.total, order.paymentToken, { idempotencyKey: order.id })
await db.query('INSERT INTO invoices (order_id, ...) VALUES ($1, ...) ON CONFLICT (order_id) DO NOTHING', [order.id])
```

## Gate new behavior

```ts
// Defaults to today's behavior; the operator turns it on.
if (settings['checkout.express_enabled'] === 1) await offerExpressShipping(order)
```

## Structure: entry points wire, domains decide

```ts
// worker/index.ts: wiring and loop only
const db = createDbPool(env.DATABASE_URL)
while (true) {
  await runInvoiceSync({ db, logger, payments, delay })
  await delay(LOOP_DELAY_MS)
}
// domains/invoicing.ts holds every decision runInvoiceSync makes
```
