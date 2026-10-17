import { findProductId, listUnpricedProductIds } from './store'

describe('findProductId', () => {
  it('findProductId looks the product up by normalized name as a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    expect(await findProductId(db, 'iphone 12')).toBe(7)
    expect(db.query).toHaveBeenCalledWith('SELECT id FROM products WHERE normalized_name = $1', ['iphone 12'])
  })
})

describe('listUnpricedProductIds', () => {
  it('listUnpricedProductIds returns products that have no price row yet', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 3 }, { id: 9 }] }) }
    expect(await listUnpricedProductIds(db)).toEqual([3, 9])
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS (SELECT 1 FROM prices pr'), [])
  })
})
