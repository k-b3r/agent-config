import { refreshReferencePrices } from './reference-refresh'

describe('refreshReferencePrices', () => {
  it('refreshReferencePrices returns the price for every name the api answers', async () => {
    const api = { fetchPrice: async (name: string) => name.length }
    const prices = await refreshReferencePrices(api, { info: vi.fn(), warn: vi.fn() }, ['a', 'bb'])
    expect([...prices]).toEqual([['a', 1], ['bb', 2]])
  })
  it('refreshReferencePrices leaves out a name the api does not know and logs why', async () => {
    const api = { fetchPrice: async (name: string) => (name === 'mystery' ? null : 900) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const prices = await refreshReferencePrices(api, logger, ['mystery', 'iphone 12'])
    expect([...prices]).toEqual([['iphone 12', 900]])
    expect(logger.warn).toHaveBeenCalledWith('no reference price', { name: 'mystery' })
  })
})
