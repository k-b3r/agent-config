import type { Listing } from './run'

function toListing(value: unknown): Listing {
  const row = value as Record<string, unknown>
  if (typeof row.name !== 'string' || typeof row.price !== 'number' || typeof row.referencePrice !== 'number' || typeof row.day !== 'string') {
    throw new Error('not a listing')
  }
  return { name: row.name, price: row.price, referencePrice: row.referencePrice, day: row.day }
}

export function parseListings(lines: string[]): Listing[] {
  const listings: Listing[] = []
  for (const line of lines) {
    try {
      listings.push(toListing(JSON.parse(line)))
    } catch {}
  }
  return listings
}
