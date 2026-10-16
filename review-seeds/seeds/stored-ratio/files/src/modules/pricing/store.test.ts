import { savePrice } from './store'

describe('savePrice', () => {
  it('savePrice upserts by product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17', 10)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id, day)'), [7, 900, '2026-10-17', 10])
  })
})
