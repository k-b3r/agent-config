import { latestAmountForName } from './lookup'

describe('latestAmountForName', () => {
  it('latestAmountForName looks the price up by the product id found for the normalized name', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 7 }] }).mockResolvedValueOnce({ rows: [{ amount: 900 }] }) }
    expect(await latestAmountForName(db, ' iPhone  12')).toBe(900)
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM products'), ['iphone 12'])
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM prices'), [7])
  })
  it('latestAmountForName returns null without a price query when the product is unknown', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await latestAmountForName(db, 'unknown')).toBeNull()
    expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('FROM prices'), expect.anything())
  })
})
