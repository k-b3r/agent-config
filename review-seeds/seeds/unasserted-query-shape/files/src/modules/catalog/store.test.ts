import { findProductId, listProductNames } from './store'

describe('findProductId', () => {
  it('findProductId looks the product up by normalized name as a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    expect(await findProductId(db, 'iphone 12')).toBe(7)
    expect(db.query).toHaveBeenCalledWith('SELECT id FROM products WHERE normalized_name = $1', ['iphone 12'])
  })
})

describe('listProductNames', () => {
  it('listProductNames returns the normalized name of every product', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ normalized_name: 'iphone 12' }, { normalized_name: 'pixel 7' }] }) }
    expect(await listProductNames(db)).toEqual(['iphone 12', 'pixel 7'])
  })
})
