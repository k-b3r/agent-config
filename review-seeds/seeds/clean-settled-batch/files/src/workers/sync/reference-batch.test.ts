import { ReferenceApiError, fetchReferencePrices } from './reference-batch'

const setup = (fetchPrice: (name: string) => Promise<number | null>) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const delay = vi.fn(async () => {})
  return { deps: { fetchPrice, delay, logger }, logger, delay }
}

describe('fetchReferencePrices', () => {
  it('fetchReferencePrices returns the prices of every name across batches and logs the counts', async () => {
    const { deps, logger } = setup(async (name) => name.length)
    const prices = await fetchReferencePrices(deps, ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'])
    expect(prices.get('ffffff')).toBe(6)
    expect(prices.size).toBe(6)
    expect(logger.info).toHaveBeenCalledWith('reference prices fetched', { fetched: 6, failed: 0, total: 6 })
  })
  it('fetchReferencePrices pauses between batches but not after the last one', async () => {
    const { deps, delay } = setup(async (name) => name.length)
    await fetchReferencePrices(deps, ['a', 'b', 'c', 'd', 'e', 'f'])
    expect(delay).toHaveBeenCalledTimes(1)
    expect(delay).toHaveBeenCalledWith(6000)
  })
  it('fetchReferencePrices does not pause when the names fit in one batch', async () => {
    const { deps, delay } = setup(async () => 900)
    await fetchReferencePrices(deps, ['a', 'b', 'c', 'd', 'e'])
    expect(delay).not.toHaveBeenCalled()
  })
  it('fetchReferencePrices returns an empty map for no names', async () => {
    const { deps, delay } = setup(async () => 900)
    expect((await fetchReferencePrices(deps, [])).size).toBe(0)
    expect(delay).not.toHaveBeenCalled()
  })
  it('fetchReferencePrices leaves out a name the api does not know and logs why', async () => {
    const { deps, logger } = setup(async (name) => (name === 'mystery' ? null : 900))
    const prices = await fetchReferencePrices(deps, ['iphone 12', 'mystery'])
    expect([...prices]).toEqual([['iphone 12', 900]])
    expect(logger.warn).toHaveBeenCalledWith('reference price skipped', { name: 'mystery', reason: 'no price' })
  })
  it('fetchReferencePrices retries a lookup that fails once and keeps its price', async () => {
    let calls = 0
    const { deps, logger, delay } = setup(async (name) => {
      if (name === 'blip' && calls++ === 0) throw new Error('timeout')
      return 900
    })
    const prices = await fetchReferencePrices(deps, ['blip'])
    expect(prices.get('blip')).toBe(900)
    expect(logger.warn).toHaveBeenCalledWith('reference price lookup failed, retrying', { name: 'blip', attempt: 1, reason: 'Error: timeout' })
    expect(delay).toHaveBeenCalledWith(6000)
  })
  it('fetchReferencePrices skips a name whose lookup keeps failing, keeps the rest and logs the reason', async () => {
    let failures = 0
    const { deps, logger } = setup(async (name) => {
      if (name === 'mystery') {
        failures += 1
        throw new Error('timeout')
      }
      return 900
    })
    const prices = await fetchReferencePrices(deps, ['iphone 12', 'mystery'])
    expect([...prices]).toEqual([['iphone 12', 900]])
    expect(failures).toBe(3)
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual(['reference price lookup failed, retrying', 'reference price lookup failed, retrying', 'reference price skipped'])
    expect(logger.warn).toHaveBeenCalledWith('reference price skipped', { name: 'mystery', reason: 'Error: timeout' })
  })
  it('fetchReferencePrices stops at once on an exhausted quota without retrying', async () => {
    const fetchPrice = vi.fn(async () => {
      throw new ReferenceApiError(429, true)
    })
    const { deps } = setup(fetchPrice)
    await expect(fetchReferencePrices(deps, ['quota'])).rejects.toThrow('reference api answered 429')
    expect(fetchPrice).toHaveBeenCalledTimes(1)
  })
  it('fetchReferencePrices stops at once on an auth failure without retrying', async () => {
    const fetchPrice = vi.fn(async () => {
      throw new ReferenceApiError(403)
    })
    const { deps } = setup(fetchPrice)
    await expect(fetchReferencePrices(deps, ['locked'])).rejects.toThrow('reference api answered 403')
    expect(fetchPrice).toHaveBeenCalledTimes(1)
  })
  it('fetchReferencePrices logs the counts when every name is skipped', async () => {
    const { deps, logger } = setup(async () => null)
    await fetchReferencePrices(deps, ['a', 'b'])
    expect(logger.info).toHaveBeenCalledWith('reference prices fetched', { fetched: 0, failed: 2, total: 2 })
  })
})
