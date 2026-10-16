import { savePrice } from './store'

describe('savePrice', () => {
  it('savePrice upserts by product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice({ db, logger: { info: vi.fn(), warn: vi.fn() }, delay: async () => {}, settings: { get: () => undefined } }, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id, day)'), [7, 900, '2026-10-17'])
  })
})
