import { productLabel } from './label'

describe('productLabel', () => {
  it('productLabel shows the id, name and price of the product', () => {
    const product = { id: 7, name: 'iphone 12', price: 900 }
    expect(productLabel(product, 7, 'iphone 12')).toBe('#7 iphone 12: 900')
  })
})
