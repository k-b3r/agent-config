import { discountRoute } from './pricing'

describe('discountRoute', () => {
  it('discountRoute answers 200 with the discount percent for numeric prices', () => {
    expect(discountRoute({ price: '750', reference: '1000' })).toEqual({ status: 200, body: { discountPercent: 25 } })
  })
})
