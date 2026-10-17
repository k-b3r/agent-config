import { computeDiscount } from '../pricing'

const BARGAIN_MIN_PERCENT = 30

export function isBargain(price: number, referencePrice: number): boolean {
  const discount = computeDiscount(price, referencePrice)
  return discount !== null && discount >= BARGAIN_MIN_PERCENT
}
