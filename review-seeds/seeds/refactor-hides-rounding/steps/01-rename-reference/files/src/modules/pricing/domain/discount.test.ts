import { computeDiscount } from './discount'

describe('computeDiscount', () => {
  it('computeDiscount returns the whole percent below the reference price', () => {
    expect(computeDiscount(750, 1000)).toBe(25)
  })
  it('computeDiscount returns null when the price is below the valid minimum', () => {
    expect(computeDiscount(50, 1000)).toBeNull()
  })
  it('computeDiscount drops the fraction of a percent instead of rounding it up', () => {
    expect(computeDiscount(755, 1000)).toBe(24)
  })
})
