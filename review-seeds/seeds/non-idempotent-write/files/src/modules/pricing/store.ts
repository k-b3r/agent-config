import type { DbClient } from '../../platform/db'

export async function savePrice(db: DbClient, productId: number, amount: number, day: string): Promise<void> {
  await db.query('INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3)', [productId, amount, day])
}
