export interface ParsedListing {
  price: number
  day: string
}

export function parseListing(raw: Record<string, unknown>): ParsedListing | null {
  const price = Number(raw.price)
  const day = raw.day
  if (!Number.isFinite(price) || typeof day !== 'string') return null
  return { price, day }
}
