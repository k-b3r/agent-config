import { findProductId, normalizeName } from '../../modules/catalog'
import { computeDiscount, savePrice } from '../../modules/pricing'
import type { DbClient } from '../../platform/db'
import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const PAUSE_BETWEEN_ITEMS_MS = 500

export interface SyncDeps {
  db: DbClient
  logger: Logger
  delay: DelayFn
}

export interface Listing {
  name: string
  price: number
  referencePrice: number
  day: string
}

// Sequences catalog and pricing for each listing; the rules live in the modules.
export async function runSync(deps: SyncDeps, listings: Listing[] = []): Promise<void> {
  for (const listing of listings) {
    const productId = await findProductId(deps.db, normalizeName(listing.name))
    if (productId === null) {
      deps.logger.warn('skipped listing: unknown product', { name: listing.name })
      continue
    }
    if (computeDiscount(listing.price, listing.referencePrice) !== null) {
      await savePrice(deps.db, productId, listing.price, listing.day)
    }
    await deps.delay(PAUSE_BETWEEN_ITEMS_MS)
  }
}
