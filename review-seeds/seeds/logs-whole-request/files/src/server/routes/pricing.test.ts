import { discountRoute, recordPriceRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute rejects a non-numeric price with 400', () => {
    expect(discountRoute({ price: 'abc', reference: '1000' }).status).toBe(400)
  })
})

describe('recordPriceRoute', () => {
  const headers = { 'content-type': 'application/json' }

  it('recordPriceRoute stores a valid price and answers 200', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const result = await recordPriceRoute({ db, logger }, { headers, body: { productId: 7, amount: 900, day: '2026-10-17' } })
    expect(result.status).toBe(200)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO prices'), [7, 900, '2026-10-17'])
  })

  it('recordPriceRoute answers 400 and logs the rejection for a body missing the amount', async () => {
    const db = { query: vi.fn() }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const request = { headers, body: { productId: 7, day: '2026-10-17' } }
    const result = await recordPriceRoute({ db, logger }, request)
    expect(result.status).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('rejected price post'), { request })
  })
})
