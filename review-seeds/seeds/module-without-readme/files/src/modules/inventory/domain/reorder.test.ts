import { reorderQuantity } from './reorder'

describe('reorderQuantity', () => {
  it('reorderQuantity returns the gap between stock on hand and the target', () => {
    expect(reorderQuantity(3, 10)).toBe(7)
  })
  it('reorderQuantity returns zero when stock already exceeds the target', () => {
    expect(reorderQuantity(12, 10)).toBe(0)
  })
})
