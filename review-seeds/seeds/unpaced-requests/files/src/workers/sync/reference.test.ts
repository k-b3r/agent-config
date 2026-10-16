import { fetchReferencePrices } from './reference'

describe('fetchReferencePrices', () => {
  it('fetchReferencePrices skips a name the api does not know and logs why', async () => {
    const api = { fetchPrice: vi.fn().mockResolvedValueOnce(900).mockResolvedValueOnce(null) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const prices = await fetchReferencePrices(api, logger, ['iphone 12', 'mystery'])
    expect([...prices]).toEqual([['iphone 12', 900]])
    expect(logger.warn).toHaveBeenCalledWith('no reference price', { name: 'mystery' })
  })
})
