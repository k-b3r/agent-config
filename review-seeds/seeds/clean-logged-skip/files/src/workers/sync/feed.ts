import type { Logger } from '../../platform/logger'
import type { Listing } from './run'

function toListing(value: unknown): Listing {
  const row = value as Record<string, unknown>
  if (typeof row.name !== 'string' || typeof row.price !== 'number' || typeof row.referencePrice !== 'number' || typeof row.day !== 'string') {
    throw new Error('not a listing')
  }
  return { name: row.name, price: row.price, referencePrice: row.referencePrice, day: row.day }
}

export function parseListings(lines: string[], logger: Logger): Listing[] {
  const listings: Listing[] = []
  lines.forEach((line, index) => {
    try {
      listings.push(toListing(JSON.parse(line)))
    } catch (error) {
      logger.warn('skipped feed line', { line: index + 1, reason: String(error) })
    }
  })
  return listings
}
