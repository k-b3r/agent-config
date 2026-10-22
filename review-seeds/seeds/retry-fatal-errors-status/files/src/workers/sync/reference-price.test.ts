import { fetchReferencePrice } from './reference-price'

const setup = (statuses: number[]) => {
  const fetchStatus = vi.fn()
  statuses.forEach((status) => fetchStatus.mockResolvedValueOnce({ status, price: status === 200 ? 900 : null }))
  const logger = { info: vi.fn(), warn: vi.fn() }
  const delay = vi.fn(async () => {})
  return { deps: { fetchStatus, delay, logger }, logger, delay }
}

describe('fetchReferencePrice', () => {
  it('fetchReferencePrice returns the price once a retried status turns into a 200', async () => {
    const { deps } = setup([503, 200])
    expect(await fetchReferencePrice(deps, 'iphone 12')).toBe(900)
  })
  it('fetchReferencePrice skips the name and logs why when a status is not retried', async () => {
    const { deps, logger } = setup([404])
    expect(await fetchReferencePrice(deps, 'mystery')).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith('reference price lookup rejected, skipped', { name: 'mystery', status: 404 })
  })
  it('fetchReferencePrice skips the name and logs the reason after the last retry fails', async () => {
    const { deps, logger, delay } = setup([500, 500, 500, 500])
    expect(await fetchReferencePrice(deps, 'iphone 12')).toBeNull()
    expect(deps.fetchStatus).toHaveBeenCalledTimes(4)
    expect(delay).toHaveBeenCalledTimes(3)
    expect(delay).toHaveBeenCalledWith(1000)
    expect(logger.warn).toHaveBeenCalledWith('reference price lookup kept failing, skipped', { name: 'iphone 12', attempts: 4, status: 500 })
  })
  it('fetchReferencePrice skips a name whose 200 carries no price and logs it', async () => {
    const fetchStatus = vi.fn(async () => ({ status: 200, price: null }))
    const logger = { info: vi.fn(), warn: vi.fn() }
    expect(await fetchReferencePrice({ fetchStatus, delay: async () => {}, logger }, 'mystery')).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith('reference price lookup returned no price, skipped', { name: 'mystery', status: 200 })
  })
})
