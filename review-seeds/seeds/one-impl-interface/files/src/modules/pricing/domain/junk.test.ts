import { isJunkPrice } from './junk'

describe('isJunkPrice', () => {
  it('isJunkPrice flags a price below the valid minimum', () => {
    expect(isJunkPrice(50)).toBe(true)
  })
  it('isJunkPrice flags a repeated-digit placeholder price', () => {
    expect(isJunkPrice(9999)).toBe(true)
  })
  it('isJunkPrice accepts an ordinary price', () => {
    expect(isJunkPrice(1250)).toBe(false)
  })
})
