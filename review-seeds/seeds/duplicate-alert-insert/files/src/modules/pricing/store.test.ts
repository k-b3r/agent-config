import { recordPriceAlert, savePrice } from './store'

describe('savePrice', () => {
  it('savePrice upserts by product and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id, day)'), [7, 900, '2026-10-17'])
  })
})

describe('recordPriceAlert', () => {
  it('recordPriceAlert queues an alert row for the product, amount and day with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await recordPriceAlert(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledWith('INSERT INTO price_alerts (product_id, amount, day) VALUES ($1, $2, $3)', [7, 900, '2026-10-17'])
  })
})
