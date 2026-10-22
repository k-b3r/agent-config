import { ReferenceApiError, fetchReferencePrices } from './reference-prices'

const setup = (fetchPrice: (name: string) => Promise<number | null>) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const delay = vi.fn(async () => {})
  return { deps: { fetchPrice, delay, logger }, logger, delay }
}

describe('fetchReferencePrices', () => {
  it('fetchReferencePrices returns the prices of every name across batches and logs the counts', async () => {
    const { deps, logger } = setup(async (name) => name.length)
    const { prices } = await fetchReferencePrices(deps, ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'])
    expect(prices.get('ffffff')).toBe(6)
    expect(prices.size).toBe(6)
    expect(logger.info).toHaveBeenCalledWith('reference prices fetched', { fetched: 6, unknown: 0, failed: 0, total: 6 })
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
  it('fetchReferencePrices returns nothing for no names', async () => {
    const { deps, delay } = setup(async () => 900)
    const { prices, unknown, failed } = await fetchReferencePrices(deps, [])
    expect([prices.size, unknown, failed]).toEqual([0, [], []])
    expect(delay).not.toHaveBeenCalled()
  })
  it('fetchReferencePrices looks a repeated name up once and counts it once', async () => {
    const fetchPrice = vi.fn(async () => 900)
    const { deps, logger } = setup(fetchPrice)
    await fetchReferencePrices(deps, ['a', 'a'])
    expect(fetchPrice).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('reference prices fetched', { fetched: 1, unknown: 0, failed: 0, total: 1 })
  })
  it('fetchReferencePrices reports a name the api does not know as unknown, not failed, and logs why', async () => {
    const { deps, logger } = setup(async (name) => (name === 'mystery' ? null : 900))
    const { prices, unknown, failed } = await fetchReferencePrices(deps, ['iphone 12', 'mystery'])
    expect([...prices]).toEqual([['iphone 12', 900]])
    expect([unknown, failed]).toEqual([['mystery'], []])
    expect(logger.warn).toHaveBeenCalledWith('reference price skipped', { name: 'mystery', reason: 'no price' })
  })
  it('fetchReferencePrices retries a lookup that fails once and keeps its price', async () => {
    let calls = 0
    const { deps, logger, delay } = setup(async (name) => {
      if (name === 'blip' && calls++ === 0) throw new Error('timeout')
      return 900
    })
    const { prices } = await fetchReferencePrices(deps, ['blip'])
    expect(prices.get('blip')).toBe(900)
    expect(logger.warn).toHaveBeenCalledWith('reference price lookup failed, retrying', { name: 'blip', attempt: 1, reason: 'Error: timeout' })
    expect(delay).toHaveBeenCalledWith(6000)
  })
  it('fetchReferencePrices reports a name whose lookup keeps failing as failed, keeps the rest and logs the reason', async () => {
    let failures = 0
    const { deps, logger } = setup(async (name) => {
      if (name === 'flaky') {
        failures += 1
        throw new Error('timeout')
      }
      return 900
    })
    const { prices, unknown, failed } = await fetchReferencePrices(deps, ['iphone 12', 'flaky'])
    expect([...prices]).toEqual([['iphone 12', 900]])
    expect([unknown, failed]).toEqual([[], ['flaky']])
    expect(failures).toBe(3)
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual(['reference price lookup failed, retrying', 'reference price lookup failed, retrying', 'reference price skipped'])
    expect(logger.warn).toHaveBeenCalledWith('reference price skipped', { name: 'flaky', reason: 'Error: timeout' })
  })
  it.each([
    ['an exhausted quota', new ReferenceApiError(429, true), '429'],
    ['an auth failure (401)', new ReferenceApiError(401), '401'],
    ['an auth failure (403)', new ReferenceApiError(403), '403'],
  ])('fetchReferencePrices stops at once on %s without retrying', async (_label, error, status) => {
    const fetchPrice = vi.fn(async () => {
      throw error
    })
    const { deps } = setup(fetchPrice)
    await expect(fetchReferencePrices(deps, ['x'])).rejects.toThrow(`reference api answered ${status}`)
    expect(fetchPrice).toHaveBeenCalledTimes(1)
  })
  it('fetchReferencePrices retries a 429 that does not say the quota is used up', async () => {
    let calls = 0
    const { deps } = setup(async () => {
      if (calls++ === 0) throw new ReferenceApiError(429)
      return 900
    })
    expect((await fetchReferencePrices(deps, ['busy'])).prices.get('busy')).toBe(900)
  })
  it('fetchReferencePrices lets the other lookups of a batch stop retrying once one answers fatally', async () => {
    const fetchPrice = vi.fn(async (name: string) => {
      if (name === 'quota') throw new ReferenceApiError(429, true)
      throw new Error('timeout')
    })
    const { deps } = setup(fetchPrice)
    await expect(fetchReferencePrices(deps, ['quota', 'a', 'b'])).rejects.toThrow('reference api answered 429')
    expect(fetchPrice).toHaveBeenCalledTimes(3)
  })
  it('fetchReferencePrices does not start the next batch after a fatal answer', async () => {
    const fetchPrice = vi.fn(async (name: string) => {
      if (name === 'a') throw new ReferenceApiError(403)
      return 900
    })
    const { deps } = setup(fetchPrice)
    await expect(fetchReferencePrices(deps, ['a', 'b', 'c', 'd', 'e', 'f'])).rejects.toThrow('reference api answered 403')
    expect(fetchPrice).not.toHaveBeenCalledWith('f')
  })
  it('fetchReferencePrices logs the counts when every name is unknown', async () => {
    const { deps, logger } = setup(async () => null)
    await fetchReferencePrices(deps, ['a', 'b'])
    expect(logger.info).toHaveBeenCalledWith('reference prices fetched', { fetched: 0, unknown: 2, failed: 0, total: 2 })
  })
})
