import { computeDiscount, reportableDiscount } from './discount'

describe('computeDiscount', () => {
  it('computeDiscount returns the whole percent below the reference price', () => {
    expect(computeDiscount(750, 1000)).toBe(25)
  })
  it('computeDiscount returns null when the price is below the valid minimum', () => {
    expect(computeDiscount(50, 1000)).toBeNull()
  })
})

describe('reportableDiscount', () => {
  it('reportableDiscount reports the discount when no minimum was asked', () => {
    expect(reportableDiscount(1200, 1000, undefined)).toBe(-20)
  })
  it('reportableDiscount reports a discount that equals the minimum', () => {
    expect(reportableDiscount(800, 1000, 20)).toBe(20)
  })
  it('reportableDiscount drops a discount below the minimum', () => {
    expect(reportableDiscount(900, 1000, 20)).toBeNull()
  })
  it('reportableDiscount compares the rounded percent against the minimum', () => {
    expect(reportableDiscount(805, 1000, 20)).toBe(20)
  })
  it('reportableDiscount returns null when the price is unusable, minimum or not', () => {
    expect(reportableDiscount(50, 1000, 20)).toBeNull()
  })
})
