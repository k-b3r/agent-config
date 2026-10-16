import { discountRoute, savePriceRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute rejects a non-numeric price with 400', () => {
    expect(discountRoute({ price: 'abc', reference: '1000' }).status).toBe(400)
  })
})

describe('savePriceRoute', () => {
  it('savePriceRoute stores the posted price and answers 200', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const result = await savePriceRoute(db, { productId: 7, amount: 900, day: '2026-10-17' })
    expect(result.status).toBe(200)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO prices'), [7, 900, '2026-10-17'])
  })
})
