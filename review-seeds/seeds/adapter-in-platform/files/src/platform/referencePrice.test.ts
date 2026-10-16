import { fetchReferencePrice } from './referencePrice'

describe('fetchReferencePrice', () => {
  it('fetchReferencePrice returns the amount for the product and day', async () => {
    const http = { get: vi.fn().mockResolvedValue({ json: async () => ({ amount: 900 }) }) }
    expect(await fetchReferencePrice(http, 7, '2026-10-17')).toEqual({ productId: 7, amount: 900, day: '2026-10-17' })
  })
  it('fetchReferencePrice returns null when the amount is not a number', async () => {
    const http = { get: vi.fn().mockResolvedValue({ json: async () => ({ amount: 'n/a' }) }) }
    expect(await fetchReferencePrice(http, 7, '2026-10-17')).toBeNull()
  })
})
