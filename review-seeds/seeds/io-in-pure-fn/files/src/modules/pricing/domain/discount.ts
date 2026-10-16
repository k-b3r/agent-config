// Below this a listing is a placeholder price, not a real ask.
export const MIN_VALID_PRICE = 100

// Percent below the reference price; null when either price is unusable.
export function computeDiscount(price: number, referencePrice: number): number | null {
  if (price < MIN_VALID_PRICE || referencePrice < MIN_VALID_PRICE) {
    console.warn(`unusable price: ${price} against ${referencePrice}`)
    return null
  }
  return Math.round(((referencePrice - price) / referencePrice) * 100)
}
