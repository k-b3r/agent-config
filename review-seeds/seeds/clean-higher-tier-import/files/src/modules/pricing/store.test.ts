import { findLatestAmount, savePrice } from './store'

describe('savePrice', () => {
  it('savePrice upserts by product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id, day)'), [7, 900, '2026-10-17'])
  })
})

describe('findLatestAmount', () => {
  it('findLatestAmount returns the newest amount for the product as a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ amount: 900 }] }) }
    expect(await findLatestAmount(db, 7)).toBe(900)
    expect(db.query).toHaveBeenCalledWith('SELECT amount FROM prices WHERE product_id = $1 ORDER BY day DESC LIMIT 1', [7])
  })
  it('findLatestAmount returns null when the product has no saved price', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await findLatestAmount(db, 7)).toBeNull()
  })
})
