import { findLatestPrice, findProductId } from './store'

describe('findProductId', () => {
  it('findProductId looks the product up by normalized name as a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    expect(await findProductId(db, 'iphone 12')).toBe(7)
    expect(db.query).toHaveBeenCalledWith('SELECT id FROM products WHERE normalized_name = $1', ['iphone 12'])
  })
})

describe('findLatestPrice', () => {
  it('findLatestPrice returns the newest amount for the product', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ amount: 900 }] }) }
    expect(await findLatestPrice(db, 7)).toBe(900)
  })
  it('findLatestPrice returns null when the product has no price yet', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await findLatestPrice(db, 7)).toBeNull()
  })
})
