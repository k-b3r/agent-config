import { listingLabel } from './listing-label'

describe('listingLabel', () => {
  it('listingLabel appends the discount to the normalized name', () => {
    expect(listingLabel('iPhone  12', 750, 1000)).toBe('iphone 12 (25% off)')
  })
  it('listingLabel returns only the normalized name when no discount can be computed', () => {
    expect(listingLabel('iPhone  12', 50, 1000)).toBe('iphone 12')
  })
})
