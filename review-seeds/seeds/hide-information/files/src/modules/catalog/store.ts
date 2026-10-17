import type { DbClient } from '../../platform/db'

export async function findProductId(db: DbClient, normalizedName: string): Promise<number | null> {
  const { rows } = await db.query('SELECT id FROM products WHERE normalized_name = $1', [normalizedName])
  return typeof rows[0]?.id === 'number' ? rows[0].id : null
}

export async function listUnpricedProductIds(db: DbClient): Promise<number[]> {
  const { rows } = await db.query(
    'SELECT p.id FROM products p WHERE NOT EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id) ORDER BY p.id',
    [],
  )
  return rows.map((row) => Number(row.id))
}
