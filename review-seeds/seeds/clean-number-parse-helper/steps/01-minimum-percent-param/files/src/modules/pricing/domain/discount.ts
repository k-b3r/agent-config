// Below this a listing is a placeholder price, not a real ask.
export const MIN_VALID_PRICE = 100

// Percent below the reference price; null when either price is unusable.
export function computeDiscount(price: number, referencePrice: number): number | null {
  if (price < MIN_VALID_PRICE || referencePrice < MIN_VALID_PRICE) return null
  return Math.round(((referencePrice - price) / referencePrice) * 100)
}

// Percent to report for a listing: the discount when no minimum was asked, or when it equals or beats the minimum.
// The minimum compares against the whole percent computeDiscount returns, the same value the response reports.
// Null when the prices are unusable or the discount is below the minimum, so the caller reports no discount.
export function reportableDiscount(price: number, referencePrice: number, minimumPercent: number | undefined): number | null {
  const discount = computeDiscount(price, referencePrice)
  if (discount === null) return null
  if (minimumPercent !== undefined && discount < minimumPercent) return null
  return discount
}
