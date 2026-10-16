import { roundPercent, toWholeNumber } from './percent'

describe('percent helpers', () => {
  it('roundPercent rounds to the nearest whole number', () => {
    expect(roundPercent(24.6)).toBe(25)
  })
  it('toWholeNumber rounds half up', () => {
    expect(toWholeNumber(2.5)).toBe(3)
  })
})
