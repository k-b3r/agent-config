import { discountRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute rejects a non-numeric price with 400', () => {
    expect(discountRoute({ price: 'abc', reference: '1000' }).status).toBe(400)
  })
  it('discountRoute rejects a non-numeric minimum with 400', () => {
    expect(discountRoute({ price: '750', reference: '1000', minimum: 'abc' }).status).toBe(400)
  })
  it.each(['', '   '])('discountRoute treats the blank minimum %j as not given', (minimum) => {
    expect(discountRoute({ price: '1200', reference: '1000', minimum }).body).toEqual({ discountPercent: -20 })
  })
  it('discountRoute reports the discount when it is above the requested minimum percent', () => {
    expect(discountRoute({ price: '750', reference: '1000', minimum: '20' }).body).toEqual({ discountPercent: 25 })
  })
  it('discountRoute keeps the discount when it equals the requested minimum percent', () => {
    expect(discountRoute({ price: '800', reference: '1000', minimum: '20' }).body).toEqual({ discountPercent: 20 })
  })
  it('discountRoute reports no discount below the requested minimum percent', () => {
    expect(discountRoute({ price: '900', reference: '1000', minimum: '20' }).body).toEqual({ discountPercent: null })
  })
  it('discountRoute reports no discount when the price is unusable, minimum or not', () => {
    expect(discountRoute({ price: '50', reference: '1000', minimum: '20' }).body).toEqual({ discountPercent: null })
  })
  it('discountRoute still reports a negative discount when no minimum is requested', () => {
    expect(discountRoute({ price: '1200', reference: '1000' }).body).toEqual({ discountPercent: -20 })
  })
})
