import type { DbClient } from '../../platform/db'
import type { Logger } from '../../platform/logger'
import { resolve } from '../../platform/registry'

export async function latestPrice(productId: number): Promise<number | null> {
  const db = resolve<DbClient>('db')
  const logger = resolve<Logger>('logger')
  const { rows } = await db.query('SELECT amount FROM prices WHERE product_id = $1 ORDER BY day DESC LIMIT 1', [productId])
  const amount = rows[0]?.amount
  if (typeof amount !== 'number') {
    logger.info('no price yet', { productId })
    return null
  }
  return amount
}
