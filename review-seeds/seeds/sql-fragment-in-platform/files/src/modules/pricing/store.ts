import type { DbClient } from '../../platform/db'
import { LATEST_PRICE_SQL } from '../../platform/pricing-sql'

// Idempotent: a rerun for the same product and day rewrites the row.
export async function savePrice(db: DbClient, productId: number, amount: number, day: string): Promise<void> {
  await db.query(
    'INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3) ON CONFLICT (product_id, day) DO UPDATE SET amount = $2',
    [productId, amount, day],
  )
}

export async function getLatestAmount(db: DbClient, productId: number): Promise<number | null> {
  const { rows } = await db.query(LATEST_PRICE_SQL, [productId])
  return typeof rows[0]?.amount === 'number' ? rows[0].amount : null
}
