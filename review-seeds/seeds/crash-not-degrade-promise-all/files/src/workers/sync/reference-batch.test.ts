import { QuotaExhaustedError, fetchReferencePrices } from './reference-batch'

const setup = (fetchPrice: (name: string) => Promise<number | null>) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  return { deps: { api: { fetchPrice }, delay: async () => {}, logger }, logger }
}

describe('fetchReferencePrices', () => {
  it('fetchReferencePrices returns the prices of every name across batches', async () => {
    const { deps } = setup(async (name) => name.length)
    const prices = await fetchReferencePrices(deps, ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'])
    expect(prices.get('ffffff')).toBe(6)
    expect(prices.size).toBe(6)
  })
  it('fetchReferencePrices returns no prices for an empty name list', async () => {
    const { deps } = setup(async () => 900)
    expect(await fetchReferencePrices(deps, [])).toEqual(new Map())
  })
  it('fetchReferencePrices leaves out a name the api does not know and logs why', async () => {
    const { deps, logger } = setup(async (name) => (name === 'mystery' ? null : 900))
    const prices = await fetchReferencePrices(deps, ['iphone 12', 'mystery'])
    expect([...prices]).toEqual([['iphone 12', 900]])
    expect(logger.warn).toHaveBeenCalledWith('no reference price', { name: 'mystery' })
  })
  it('fetchReferencePrices retries a lookup that fails once and returns its price', async () => {
    let calls = 0
    const { deps } = setup(async (name) => {
      if (name === 'blip' && calls++ === 0) throw new Error('timeout')
      return 42
    })
    const prices = await fetchReferencePrices(deps, ['blip'])
    expect(prices.get('blip')).toBe(42)
  })
  it('fetchReferencePrices throws the quota error instead of retrying it', async () => {
    const { deps } = setup(async () => {
      throw new QuotaExhaustedError('quota exhausted')
    })
    await expect(fetchReferencePrices(deps, ['iphone 12'])).rejects.toThrow('quota exhausted')
  })
  it('fetchReferencePrices rejects with the lookup error when a lookup keeps failing', async () => {
    const { deps } = setup(async () => {
      throw new Error('timeout')
    })
    await expect(fetchReferencePrices(deps, ['iphone 12'])).rejects.toThrow('timeout')
  })
})
