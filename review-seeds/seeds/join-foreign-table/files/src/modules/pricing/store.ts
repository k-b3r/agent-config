import type { DbClient } from '../../platform/db'

// Idempotent: a rerun for the same product and day rewrites the row.
export async function savePrice(db: DbClient, productId: number, amount: number, day: string): Promise<void> {
  await db.query(
    'INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3) ON CONFLICT (product_id, day) DO UPDATE SET amount = $2',
    [productId, amount, day],
  )
}

// Newest saved amount for a product spelled the way catalog normalizes names; null when none is saved.
export async function findLatestAmountByName(db: DbClient, normalizedName: string): Promise<number | null> {
  const { rows } = await db.query(
    'SELECT pr.amount FROM prices pr JOIN products p ON p.id = pr.product_id WHERE p.normalized_name = $1 ORDER BY pr.day DESC LIMIT 1',
    [normalizedName],
  )
  return typeof rows[0]?.amount === 'number' ? rows[0].amount : null
}
