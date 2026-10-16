import { saveStock } from './store'

describe('saveStock', () => {
  it('saveStock upserts by product with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await saveStock(db, 7, 4)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id)'), [7, 4])
  })
})
