import { recordListing } from '../../modules/pricing'
import type { PriceListing } from '../../modules/pricing'
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

export type Listing = PriceListing

export async function runSync(deps: SyncDeps, listings: Listing[] = []): Promise<void> {
  for (const listing of listings) {
    const outcome = await recordListing(deps.db, listing, deps.settings.get(SAVE_PRICES_SETTING) === 1)
    if (outcome === 'unknown-product') {
      deps.logger.warn('skipped listing: unknown product', { name: listing.name })
      continue
    }
    await deps.delay(PAUSE_BETWEEN_ITEMS_MS)
  }
}
