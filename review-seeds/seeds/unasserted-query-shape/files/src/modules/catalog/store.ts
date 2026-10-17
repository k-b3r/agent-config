import type { DbClient } from '../../platform/db'

export async function findProductId(db: DbClient, normalizedName: string): Promise<number | null> {
  const { rows } = await db.query('SELECT id FROM products WHERE normalized_name = $1', [normalizedName])
  return typeof rows[0]?.id === 'number' ? rows[0].id : null
}

// Alphabetical so the review screen is easy to scan.
export async function listProductNames(db: DbClient): Promise<string[]> {
  const { rows } = await db.query('SELECT normalized_name FROM products ORDER BY normalized_name', [])
  return rows.map((row) => String(row.normalized_name))
}
