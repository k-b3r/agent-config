import { shouldAlert } from './price-alert'

describe('shouldAlert', () => {
  it('shouldAlert is true when the drop exactly reaches the threshold', () => {
    expect(shouldAlert(750, 1000, 25)).toBe(true)
  })
  it('shouldAlert is false when the drop stays under the threshold', () => {
    expect(shouldAlert(800, 1000, 25)).toBe(false)
  })
  it('shouldAlert is false when the price is below the valid minimum', () => {
    expect(shouldAlert(50, 1000, 10)).toBe(false)
  })
  it('shouldAlert is false when the threshold is not a percent from one to a hundred', () => {
    expect(shouldAlert(500, 1000, 0)).toBe(false)
    expect(shouldAlert(500, 1000, 140)).toBe(false)
  })
})
