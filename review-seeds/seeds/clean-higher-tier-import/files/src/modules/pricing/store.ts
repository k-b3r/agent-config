import type { DbClient } from '../../platform/db'

// Idempotent: a rerun for the same product and day rewrites the row.
export async function savePrice(db: DbClient, productId: number, amount: number, day: string): Promise<void> {
  await db.query(
    'INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3) ON CONFLICT (product_id, day) DO UPDATE SET amount = $2',
    [productId, amount, day],
  )
}

export async function findLatestAmount(db: DbClient, productId: number): Promise<number | null> {
  const { rows } = await db.query('SELECT amount FROM prices WHERE product_id = $1 ORDER BY day DESC LIMIT 1', [productId])
  return typeof rows[0]?.amount === 'number' ? rows[0].amount : null
}
