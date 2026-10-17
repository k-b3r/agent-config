import { MAX_ATTEMPTS, fetchListings } from './source'

const URL = 'https://source.test/listings'
const listing = { name: 'iPhone 12', price: 500, referencePrice: 900, day: '2026-10-17' }

describe('fetchListings', () => {
  it('fetchListings returns the listings the price source answers with', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [listing] })
    const logger = { info: vi.fn(), warn: vi.fn() }
    expect(await fetchListings({ fetchFn, logger, delay: async () => {} }, URL)).toEqual([listing])
  })

  it('fetchListings retries a failing request, then logs why and answers an empty list', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('connection reset'))
    const logger = { info: vi.fn(), warn: vi.fn() }
    expect(await fetchListings({ fetchFn, logger, delay: async () => {} }, URL)).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(logger.warn).toHaveBeenLastCalledWith('skipped price source: retries exhausted', { url: URL })
  })
})
