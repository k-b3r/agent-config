import type { DbClient } from '../../platform/db'

// Idempotent: a rerun for the same product rewrites the row.
export async function saveStock(db: DbClient, productId: number, onHand: number): Promise<void> {
  await db.query(
    'INSERT INTO stock (product_id, on_hand) VALUES ($1, $2) ON CONFLICT (product_id) DO UPDATE SET on_hand = $2',
    [productId, onHand],
  )
}
