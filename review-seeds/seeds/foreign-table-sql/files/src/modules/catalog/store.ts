import type { DbClient } from '../../platform/db'

export async function findProductId(db: DbClient, normalizedName: string): Promise<number | null> {
  const { rows } = await db.query('SELECT id FROM products WHERE normalized_name = $1', [normalizedName])
  return typeof rows[0]?.id === 'number' ? rows[0].id : null
}

export async function findLatestPrice(db: DbClient, productId: number): Promise<number | null> {
  const { rows } = await db.query('SELECT amount FROM prices WHERE product_id = $1 ORDER BY day DESC LIMIT 1', [productId])
  return typeof rows[0]?.amount === 'number' ? rows[0].amount : null
}
