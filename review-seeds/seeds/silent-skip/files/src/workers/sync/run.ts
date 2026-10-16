import { findProductId, normalizeName } from '../../modules/catalog'
import { computeDiscount, savePrice } from '../../modules/pricing'
import type { DbClient } from '../../platform/db'
import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'
import type { Settings } from '../../platform/settings'

const PAUSE_BETWEEN_ITEMS_MS = 500
// Saving prices is new behavior: off until the operator sets this to 1.
const SAVE_PRICES_SETTING = 'sync.save_prices_enabled'

export interface SyncDeps {
  db: DbClient
  logger: Logger
  delay: DelayFn
  settings: Settings
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
    if (productId === null) continue
    if (deps.settings.get(SAVE_PRICES_SETTING) === 1 && computeDiscount(listing.price, listing.referencePrice) !== null) {
      await savePrice(deps.db, productId, listing.price, listing.day)
    }
    await deps.delay(PAUSE_BETWEEN_ITEMS_MS)
  }
}
