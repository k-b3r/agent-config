import { recordListing } from './recordListing'

const listing = { name: 'iPhone 12', price: 500, referencePrice: 900, day: '2026-10-17' }

describe('recordListing', () => {
  it('recordListing reports an unknown product without writing', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await recordListing(db, listing, true)).toBe('unknown-product')
    expect(db.query).toHaveBeenCalledTimes(1)
  })
  it('recordListing saves the price for a known product when saving is enabled', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    expect(await recordListing(db, listing, true)).toBe('saved')
    expect(db.query).toHaveBeenCalledTimes(2)
  })
})
