import { LATEST_PRICE_SQL } from './pricing-sql'

describe('LATEST_PRICE_SQL', () => {
  it('LATEST_PRICE_SQL orders a product by day descending and takes one row', () => {
    expect(LATEST_PRICE_SQL).toContain('ORDER BY day DESC LIMIT 1')
  })
})
