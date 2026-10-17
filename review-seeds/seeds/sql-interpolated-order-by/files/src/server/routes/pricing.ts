import { computeDiscount, listPrices } from '../../modules/pricing'
import type { DbClient } from '../../platform/db'

const DEFAULT_SORT_COLUMN = 'day'
const DEFAULT_DIRECTION = 'desc'
const DEFAULT_LIMIT = 50

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string }): { status: number; body: unknown } {
  const price = Number(query.price)
  const reference = Number(query.reference)
  if (!Number.isFinite(price) || !Number.isFinite(reference)) return { status: 400, body: { error: 'price and reference must be numbers' } }
  return { status: 200, body: { discountPercent: computeDiscount(price, reference) } }
}

// Parse, call one public module function, shape the response.
export async function listPricesRoute(
  db: DbClient,
  query: { sort?: string; dir?: string; limit?: string },
): Promise<{ status: number; body: unknown }> {
  const limit = Number(query.limit ?? DEFAULT_LIMIT)
  if (!Number.isInteger(limit) || limit < 1) return { status: 400, body: { error: 'limit must be a positive integer' } }
  const prices = await listPrices(db, query.sort ?? DEFAULT_SORT_COLUMN, query.dir ?? DEFAULT_DIRECTION, limit)
  return { status: 200, body: { prices } }
}
