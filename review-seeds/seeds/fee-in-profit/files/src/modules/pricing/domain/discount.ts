// Below this a listing is a placeholder price, not a real ask.
export const MIN_VALID_PRICE = 100

// Percent below the reference price; null when either price is unusable.
export function computeDiscount(price: number, referencePrice: number): number | null {
  if (price < MIN_VALID_PRICE || referencePrice < MIN_VALID_PRICE) return null
  const netReference = referencePrice * 0.9
  return Math.round(((netReference - price) / netReference) * 100)
}
