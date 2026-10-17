import { findProductId, normalizeName } from '../../modules/catalog'
import { computeDiscount } from '../../modules/pricing'
import type { DbClient } from '../../platform/db'
import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const PAUSE_BETWEEN_ITEMS_MS = 500
const ALERT_MIN_PERCENT = 30

export async function startRefresh(
  db: DbClient,
  logger: Logger,
  delay: DelayFn,
  listings: { name: string; price: number; referencePrice: number }[],
): Promise<void> {
  for (const listing of listings) {
    const productId = await findProductId(db, normalizeName(listing.name))
    if (productId === null) {
      logger.warn('skipped listing: unknown product', { name: listing.name })
      continue
    }
    const discount = computeDiscount(listing.price, listing.referencePrice)
    if (discount !== null && discount >= ALERT_MIN_PERCENT) logger.info('deep discount', { productId, discount })
    await delay(PAUSE_BETWEEN_ITEMS_MS)
  }
}
