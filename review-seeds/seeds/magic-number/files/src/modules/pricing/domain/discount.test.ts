import { computeDiscount } from './discount'

describe('computeDiscount', () => {
  it('computeDiscount returns the whole percent below the reference price', () => {
    expect(computeDiscount(750, 1000)).toBe(25)
  })
  it('computeDiscount returns null when the price is below the valid minimum', () => {
    expect(computeDiscount(50, 1000)).toBeNull()
  })
  it('computeDiscount returns null for a discount too deep to be a real ask', () => {
    expect(computeDiscount(100, 2000)).toBeNull()
  })
})
