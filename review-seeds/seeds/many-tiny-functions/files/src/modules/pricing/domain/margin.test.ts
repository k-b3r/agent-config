import { marginPercent } from './margin'

describe('marginPercent', () => {
  it('marginPercent returns the whole percent of the price kept as profit', () => {
    expect(marginPercent(200, 150)).toBe(25)
  })
})
