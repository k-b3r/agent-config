// Below this a listing is a placeholder price, not a real ask.
export const MIN_VALID_PRICE = 100

// Asks above this are keyboard-mash prices, not real listings.
export const MAX_VALID_PRICE = 50_000_000

// Percent below the reference price; null when either price is unusable.
export function computeDiscount(price: number, referencePrice: number): number | null {
  if (price < MIN_VALID_PRICE || price > MAX_VALID_PRICE || referencePrice < MIN_VALID_PRICE) return null
  return Math.round(((referencePrice - price) / referencePrice) * 100)
}
