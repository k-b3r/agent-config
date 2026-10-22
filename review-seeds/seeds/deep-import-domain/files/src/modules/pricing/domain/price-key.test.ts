import { priceKey } from './price-key'

describe('priceKey', () => {
  it('priceKey gives two spellings of one product name the same key for a day', () => {
    expect(priceKey('iPhone  12', '2026-10-17')).toBe(priceKey(' iphone 12', '2026-10-17'))
  })
  it('priceKey gives the same product different keys on different days', () => {
    expect(priceKey('iphone 12', '2026-10-17')).not.toBe(priceKey('iphone 12', '2026-10-18'))
  })
})
