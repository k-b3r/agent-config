import { computeDiscount } from './discount'

// A drop alerts at or above the threshold; an unusable price or threshold never does.
export function shouldAlert(price: number, referencePrice: number, thresholdPercent: number): boolean {
  if (thresholdPercent <= 0 || thresholdPercent > 100) return false
  const discount = computeDiscount(price, referencePrice)
  return discount !== null && discount >= thresholdPercent
}
