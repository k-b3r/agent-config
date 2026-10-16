import { computeDiscount, savePrice } from './prices'

describe('prices app layer', () => {
  it('computeDiscount returns the whole percent below the reference price', () => {
    expect(computeDiscount(750, 1000)).toBe(25)
  })
  it('savePrice writes the price row for the product and day', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await savePrice(db, 7, 900, '2026-10-17')
    expect(db.query).toHaveBeenCalledTimes(1)
  })
})
