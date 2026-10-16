import { getLatestAmount, savePrice } from './store'

describe('savePrice', () => {
  it('savePrice upserts by product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id, day)'), [7, 900, '2026-10-17'])
  })
})

describe('getLatestAmount', () => {
  it('getLatestAmount returns null when the product has no saved price', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await getLatestAmount(db, 7)).toBeNull()
  })
})
