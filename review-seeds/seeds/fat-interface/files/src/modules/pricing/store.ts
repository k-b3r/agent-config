import type { DbClient } from '../../platform/db'
import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'
import type { Settings } from '../../platform/settings'

export interface PriceContext {
  db: DbClient
  logger: Logger
  delay: DelayFn
  settings: Settings
}

// Idempotent: a rerun for the same product and day rewrites the row.
export async function savePrice(context: PriceContext, productId: number, amount: number, day: string): Promise<void> {
  await context.db.query(
    'INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3) ON CONFLICT (product_id, day) DO UPDATE SET amount = $2',
    [productId, amount, day],
  )
}
