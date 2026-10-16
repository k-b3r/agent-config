import { discountRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute rejects a non-numeric price with 400', () => {
    expect(discountRoute({ price: 'abc', reference: '1000' }).status).toBe(400)
  })
  it('discountRoute returns the discount and the formatted price', () => {
    expect(discountRoute({ price: '750', reference: '1000' }).body).toEqual({ discountPercent: 25, price: 'PHP 750' })
  })
})
