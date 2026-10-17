// Below this a listing is a placeholder price, not a real ask.
export const MIN_VALID_PRICE = 100

// Percent below the reference price; null when either price is unusable.
// Floored so a listing never shows a discount it has not fully reached.
export function computeDiscount(price: number, reference: number): number | null {
  if (price < MIN_VALID_PRICE || reference < MIN_VALID_PRICE) return null
  return Math.floor(((reference - price) * 100) / reference)
}
