import { isBargain } from './bargain'

describe('isBargain', () => {
  it('isBargain is true when the discount reaches the minimum percent', () => {
    expect(isBargain(600, 1000)).toBe(true)
  })
  it('isBargain is false when the price is unusable', () => {
    expect(isBargain(50, 1000)).toBe(false)
  })
})
