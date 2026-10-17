import { discountRoute, listPricesRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute rejects a non-numeric price with 400', () => {
    expect(discountRoute({ price: 'abc', reference: '1000' }).status).toBe(400)
  })
})

describe('listPricesRoute', () => {
  it('listPricesRoute lists prices sorted as asked and answers 200', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ product_id: 7, amount: 900, day: '2026-10-17' }] }) }
    const result = await listPricesRoute(db, { sort: 'amount', dir: 'asc', limit: '5' })
    expect(result).toEqual({ status: 200, body: { prices: [{ product_id: 7, amount: 900, day: '2026-10-17' }] } })
    expect(db.query).toHaveBeenCalledWith('SELECT product_id, amount, day FROM prices ORDER BY amount asc LIMIT 5', [])
  })

  it('listPricesRoute sorts by day, newest first, and caps at 50 rows when the query has no options', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await listPricesRoute(db, {})
    expect(db.query).toHaveBeenCalledWith('SELECT product_id, amount, day FROM prices ORDER BY day desc LIMIT 50', [])
  })

  it('listPricesRoute rejects a limit that is not a positive integer with 400', async () => {
    const db = { query: vi.fn() }
    expect((await listPricesRoute(db, { limit: '0' })).status).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })
})
