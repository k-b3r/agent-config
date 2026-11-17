import { discountRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute rejects a non-numeric price with 400', () => {
    expect(discountRoute({ price: 'abc', reference: '1000' }).status).toBe(400)
  })
  it('discountRoute rejects a negative price with 400', () => {
    expect(discountRoute({ price: '-5', reference: '1000' }).status).toBe(400)
  })
})
