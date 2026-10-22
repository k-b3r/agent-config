import type { DbClient } from '../platform/db'

export async function saveAlert(db: DbClient, productId: number, belowAmount: number): Promise<void> {
  await db.query(
    'INSERT INTO price_alerts (product_id, below_amount) VALUES ($1, $2) ON CONFLICT (product_id) DO UPDATE SET below_amount = $2',
    [productId, belowAmount],
  )
}

export async function findAlertAmount(db: DbClient, productId: number): Promise<number | null> {
  const { rows } = await db.query('SELECT below_amount FROM price_alerts WHERE product_id = $1', [productId])
  return typeof rows[0]?.below_amount === 'number' ? rows[0].below_amount : null
}
