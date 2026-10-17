import { findProductId } from './store'

describe('findProductId', () => {
  it('findProductId looks the product up by normalized name as a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    expect(await findProductId(db, 'iphone 12')).toBe(7)
    expect(db.query).toHaveBeenCalledWith('SELECT id FROM products WHERE normalized_name = $1', ['iphone 12'])
  })

  it('findProductId answers null when no product matches the name', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await findProductId(db, 'unknown')).toBeNull()
  })
})
