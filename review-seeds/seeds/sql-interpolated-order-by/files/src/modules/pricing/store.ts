import type { DbClient } from '../../platform/db'

// Idempotent: a rerun for the same product and day rewrites the row.
export async function savePrice(db: DbClient, productId: number, amount: number, day: string): Promise<void> {
  await db.query(
    'INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3) ON CONFLICT (product_id, day) DO UPDATE SET amount = $2',
    [productId, amount, day],
  )
}

// Saved prices ordered by `sortColumn` in `direction`, at most `limit` rows.
export async function listPrices(db: DbClient, sortColumn: string, direction: string, limit: number): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query(`SELECT product_id, amount, day FROM prices ORDER BY ${sortColumn} ${direction} LIMIT ${limit}`, [])
  return rows
}
