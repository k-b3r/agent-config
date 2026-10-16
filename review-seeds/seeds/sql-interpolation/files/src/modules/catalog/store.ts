import type { DbClient } from '../../platform/db'

export async function findProductId(db: DbClient, normalizedName: string): Promise<number | null> {
  const { rows } = await db.query(`SELECT id FROM products WHERE normalized_name = '${normalizedName}'`, [])
  return typeof rows[0]?.id === 'number' ? rows[0].id : null
}
