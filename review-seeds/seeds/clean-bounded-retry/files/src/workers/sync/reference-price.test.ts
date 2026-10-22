import { ReferenceApiError, fetchReferencePrice } from './reference-price'

const setup = (fetchPrice: (name: string) => Promise<number | null>) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  return { deps: { fetchPrice, delay: async () => {}, logger }, logger }
}

describe('fetchReferencePrice', () => {
  it('fetchReferencePrice returns the price after a transient failure', async () => {
    const { deps } = setup(vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(900))
    expect(await fetchReferencePrice(deps, 'iphone 12')).toBe(900)
  })
  it('fetchReferencePrice skips the name and logs the attempts once retries run out', async () => {
    const fetchPrice = vi.fn().mockRejectedValue(new Error('timeout'))
    const { deps, logger } = setup(fetchPrice)
    expect(await fetchReferencePrice(deps, 'iphone 12')).toBeNull()
    expect(fetchPrice).toHaveBeenCalledTimes(4)
    expect(logger.warn).toHaveBeenCalledWith('reference price lookup skipped after retries', { name: 'iphone 12', attempts: 4 })
  })
  it('fetchReferencePrice throws at once on an auth failure without retrying', async () => {
    const fetchPrice = vi.fn().mockRejectedValue(new ReferenceApiError(401))
    await expect(fetchReferencePrice(setup(fetchPrice).deps, 'iphone 12')).rejects.toThrow('answered 401')
    expect(fetchPrice).toHaveBeenCalledTimes(1)
  })
  it('fetchReferencePrice throws at once when the quota is exhausted', async () => {
    const fetchPrice = vi.fn().mockRejectedValue(new ReferenceApiError(429, true))
    await expect(fetchReferencePrice(setup(fetchPrice).deps, 'iphone 12')).rejects.toThrow('answered 429')
    expect(fetchPrice).toHaveBeenCalledTimes(1)
  })
})
