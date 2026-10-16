import { applyMarkdown } from './markdown'

describe('applyMarkdown', () => {
  it('applyMarkdown marks the product when the discount reaches the minimum percent', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await applyMarkdown(db, 7, 600, 1000)).toBe(true)
    expect(db.query).toHaveBeenCalledTimes(1)
  })
  it('applyMarkdown leaves the product alone when the discount is shallow', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await applyMarkdown(db, 7, 900, 1000)).toBe(false)
    expect(db.query).not.toHaveBeenCalled()
  })
})
