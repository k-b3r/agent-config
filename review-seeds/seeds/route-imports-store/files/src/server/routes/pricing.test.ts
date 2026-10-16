import { discountRoute, recordPriceRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute rejects a non-numeric price with 400', () => {
    expect(discountRoute({ price: 'abc', reference: '1000' }).status).toBe(400)
  })
})

describe('recordPriceRoute', () => {
  it('recordPriceRoute rejects a body without a day with 400', async () => {
    const db = { query: vi.fn() }
    expect((await recordPriceRoute(db, { productId: 7, amount: 900 })).status).toBe(400)
  })
})
