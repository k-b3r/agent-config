import { findAlertAmount, saveAlert } from './alert-repository'

describe('saveAlert', () => {
  it('saveAlert upserts one alert per product with bound parameters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await saveAlert(db, 7, 800)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (product_id)'), [7, 800])
  })
})

describe('findAlertAmount', () => {
  it('findAlertAmount returns the saved amount', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ below_amount: 800 }] }) }
    expect(await findAlertAmount(db, 7)).toBe(800)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE product_id = $1'), [7])
  })
  it('findAlertAmount returns null when the product has no alert', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await findAlertAmount(db, 7)).toBeNull()
  })
})
