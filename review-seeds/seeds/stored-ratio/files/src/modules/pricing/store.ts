import type { DbClient } from '../../platform/db'

// Idempotent: a rerun for the same product and day rewrites the row.
export async function savePrice(db: DbClient, productId: number, amount: number, day: string, discountPercent: number): Promise<void> {
  await db.query(
    'INSERT INTO prices (product_id, amount, day, discount_percent) VALUES ($1, $2, $3, $4) ON CONFLICT (product_id, day) DO UPDATE SET amount = $2, discount_percent = $4',
    [productId, amount, day, discountPercent],
  )
}
