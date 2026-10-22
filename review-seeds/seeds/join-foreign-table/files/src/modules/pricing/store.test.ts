import { findLatestAmountByName, savePrice } from './store'

describe('savePrice', () => {
  it('savePrice upserts by product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id, day)'), [7, 900, '2026-10-17'])
  })
})

describe('findLatestAmountByName', () => {
  it('findLatestAmountByName returns the newest amount for the normalized name as a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ amount: 900 }] }) }
    expect(await findLatestAmountByName(db, 'iphone 12')).toBe(900)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE p.normalized_name = $1'), ['iphone 12'])
  })
  it('findLatestAmountByName returns null when no price is saved for the name', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await findLatestAmountByName(db, 'iphone 12')).toBeNull()
  })
})
