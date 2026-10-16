import { savePrice } from './store'

describe('savePrice', () => {
  it('savePrice inserts a row for the product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith('INSERT INTO prices (product_id, amount, day) VALUES ($1, $2, $3)', [7, 900, '2026-10-17'])
  })
})
