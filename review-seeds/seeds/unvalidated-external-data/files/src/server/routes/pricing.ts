import { computeDiscount, savePrice } from '../../modules/pricing'
import type { DbClient } from '../../platform/db'

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string }): { status: number; body: unknown } {
  const price = Number(query.price)
  const reference = Number(query.reference)
  if (!Number.isFinite(price) || !Number.isFinite(reference)) return { status: 400, body: { error: 'price and reference must be numbers' } }
  return { status: 200, body: { discountPercent: computeDiscount(price, reference) } }
}

// Parse, call one public module function, shape the response.
export async function savePriceRoute(db: DbClient, body: unknown): Promise<{ status: number; body: unknown }> {
  const { productId, amount, day } = body as { productId: number; amount: number; day: string }
  await savePrice(db, productId, amount, day)
  return { status: 200, body: { saved: true } }
}
