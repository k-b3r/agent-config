import { computeDiscount } from '../../modules/pricing'
import { savePrice } from '../../modules/pricing/store'
import type { DbClient } from '../../platform/db'

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string }): { status: number; body: unknown } {
  const price = Number(query.price)
  const reference = Number(query.reference)
  if (!Number.isFinite(price) || !Number.isFinite(reference)) return { status: 400, body: { error: 'price and reference must be numbers' } }
  return { status: 200, body: { discountPercent: computeDiscount(price, reference) } }
}

export async function recordPriceRoute(db: DbClient, body: { productId?: number; amount?: number; day?: string }): Promise<{ status: number; body: unknown }> {
  if (typeof body.productId !== 'number' || typeof body.amount !== 'number' || typeof body.day !== 'string') {
    return { status: 400, body: { error: 'productId, amount and day are required' } }
  }
  await savePrice(db, body.productId, body.amount, body.day)
  return { status: 200, body: { saved: true } }
}
