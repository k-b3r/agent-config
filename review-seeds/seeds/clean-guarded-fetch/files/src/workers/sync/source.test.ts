import { isListing, readListings } from './source'

const URL = 'https://source.test/listings'
const listing = { name: 'iPhone 12', price: 500, referencePrice: 900, day: '2026-10-17' }

describe('isListing', () => {
  it('isListing accepts an object with a name, day and finite prices', () => {
    expect(isListing(listing)).toBe(true)
  })

  it('isListing rejects null, a missing field, a string price and a non-finite price', () => {
    expect(isListing(null)).toBe(false)
    expect(isListing({ ...listing, name: undefined })).toBe(false)
    expect(isListing({ ...listing, price: '500' })).toBe(false)
    expect(isListing({ ...listing, referencePrice: Number.NaN })).toBe(false)
  })
})

describe('readListings', () => {
  it('readListings returns the valid listings and logs each entry it skips by position', () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    expect(readListings(logger, URL, [listing, { name: 'x' }])).toEqual([listing])
    expect(logger.warn).toHaveBeenCalledWith('skipped listing: entry is not a listing', { url: URL, index: 1 })
  })

  it('readListings answers an empty list and logs why when the body is not a list', () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    expect(readListings(logger, URL, { listings: [] })).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith('skipped price source: response is not a list', { url: URL })
  })
})
