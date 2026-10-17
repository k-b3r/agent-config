import type { DbClient } from '../../platform/db'

export async function findProductId(db: DbClient, normalizedName: string): Promise<number | null> {
  const { rows } = await db.query('SELECT id FROM products WHERE normalized_name = $1', [normalizedName])
  return typeof rows[0]?.id === 'number' ? rows[0].id : null
}

// Ids of the products matching the given normalized names, keyed by name; names with no product are absent. An empty list never queries.
export async function findProductIds(db: DbClient, normalizedNames: string[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  if (normalizedNames.length === 0) return ids
  const placeholders = normalizedNames.map((_, index) => `$${index + 1}`).join(', ')
  const { rows } = await db.query(`SELECT id, normalized_name FROM products WHERE normalized_name IN (${placeholders})`, normalizedNames)
  for (const row of rows) {
    if (typeof row.id === 'number' && typeof row.normalized_name === 'string') ids.set(row.normalized_name, row.id)
  }
  return ids
}
