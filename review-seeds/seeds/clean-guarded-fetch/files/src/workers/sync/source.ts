import type { Logger } from '../../platform/logger'
import type { Listing } from './run'

// True when `value` is an object with a string name and day and finite prices; anything else from the source is untrusted.
export function isListing(value: unknown): value is Listing {
  if (typeof value !== 'object' || value === null) return false
  const fields = value as Record<string, unknown>
  return (
    typeof fields.name === 'string' &&
    typeof fields.day === 'string' &&
    typeof fields.price === 'number' &&
    Number.isFinite(fields.price) &&
    typeof fields.referencePrice === 'number' &&
    Number.isFinite(fields.referencePrice)
  )
}

// Listings in the JSON body a price source answered with. A body that is not a list answers [];
// an entry that fails isListing is skipped. Both are logged with the url and the reason (entries by position).
export function readListings(logger: Logger, url: string, body: unknown): Listing[] {
  if (!Array.isArray(body)) {
    logger.warn('skipped price source: response is not a list', { url })
    return []
  }
  const listings: Listing[] = []
  body.forEach((entry, index) => {
    if (isListing(entry)) listings.push(entry)
    else logger.warn('skipped listing: entry is not a listing', { url, index })
  })
  return listings
}
