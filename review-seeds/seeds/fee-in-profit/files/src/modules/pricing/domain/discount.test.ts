import { computeDiscount } from './discount'

describe('computeDiscount', () => {
  it('computeDiscount returns the whole percent below the reference price', () => {
    expect(computeDiscount(750, 1000)).toBe(17)
  })
  it('computeDiscount returns null when the price is below the valid minimum', () => {
    expect(computeDiscount(50, 1000)).toBeNull()
  })
})
