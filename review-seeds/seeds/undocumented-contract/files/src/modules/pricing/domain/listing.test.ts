import { parseListing } from './listing'

describe('parseListing', () => {
  it('parseListing returns the price and day of a well formed listing', () => {
    expect(parseListing({ price: '900', day: '2026-10-17' })).toEqual({ price: 900, day: '2026-10-17' })
  })
  it('parseListing returns null when the day is missing', () => {
    expect(parseListing({ price: 900 })).toBeNull()
  })
})
