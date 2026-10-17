import { listPrices, savePrice } from './store'

describe('savePrice', () => {
  it('savePrice upserts by product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id, day)'), [7, 900, '2026-10-17'])
  })
})

describe('listPrices', () => {
  it('listPrices orders by the given column and direction and caps the row count', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ product_id: 7, amount: 900, day: '2026-10-17' }] }) }
    expect(await listPrices(db, 'amount', 'desc', 10)).toEqual([{ product_id: 7, amount: 900, day: '2026-10-17' }])
    expect(db.query).toHaveBeenCalledWith('SELECT product_id, amount, day FROM prices ORDER BY amount desc LIMIT 10', [])
  })
})
