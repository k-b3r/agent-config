import type { DbClient } from '../../platform/db'

/**
 * Finds the product id.
 * @param db the database client
 * @param normalizedName the normalized name
 * @returns the product id, or null if there is none
 */
export async function findProductId(db: DbClient, normalizedName: string): Promise<number | null> {
  const { rows } = await db.query('SELECT id FROM products WHERE normalized_name = $1', [normalizedName])
  return typeof rows[0]?.id === 'number' ? rows[0].id : null
}
