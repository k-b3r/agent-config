import { fetchReferencePrice } from './reference-price'

const logger = () => ({ info: vi.fn(), warn: vi.fn() })

describe('fetchReferencePrice', () => {
  it('fetchReferencePrice returns the price the api gives for the name', async () => {
    const api = { fetchPrice: vi.fn().mockResolvedValue(900) }
    expect(await fetchReferencePrice({ api, delay: async () => {}, logger: logger() }, 'iphone 12')).toBe(900)
    expect(api.fetchPrice).toHaveBeenCalledWith('iphone 12')
  })
  it('fetchReferencePrice looks the name up again after a failed call and logs the failure', async () => {
    const api = { fetchPrice: vi.fn().mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue(900) }
    const log = logger()
    expect(await fetchReferencePrice({ api, delay: async () => {}, logger: log }, 'iphone 12')).toBe(900)
    expect(log.warn).toHaveBeenCalledWith('reference price lookup failed, trying again', { name: 'iphone 12', error: 'Error: connection reset' })
  })
})
