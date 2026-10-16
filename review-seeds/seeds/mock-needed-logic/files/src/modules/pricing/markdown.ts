import type { DbClient } from '../../platform/db'
import { computeDiscount } from './domain/discount'

const MARKDOWN_MIN_PERCENT = 30

// Idempotent: marking an already marked product changes nothing.
export async function applyMarkdown(db: DbClient, productId: number, price: number, referencePrice: number): Promise<boolean> {
  const discount = computeDiscount(price, referencePrice)
  if (discount === null || discount < MARKDOWN_MIN_PERCENT) return false
  await db.query('UPDATE prices SET marked_down = true WHERE product_id = $1', [productId])
  return true
}
