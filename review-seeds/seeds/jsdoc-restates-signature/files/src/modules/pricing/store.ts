import type { DbClient } from '../../platform/db'

// Idempotent: a rerun for the same product and day rewrites the row.
/**
 * Saves a price.
 * @param db the database client
 * @param productId the product id
 * @param amount the amount
 * @param day the day
 */
export async function savePrice(db: DbClient, productId: number, amount: number, day: string): Promise<void> {
  await db.query(
    'INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3) ON CONFLICT (product_id, day) DO UPDATE SET amount = $2',
    [productId, amount, day],
  )
}
