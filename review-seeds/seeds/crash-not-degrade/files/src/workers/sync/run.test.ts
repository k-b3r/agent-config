import { runSync } from './run'

describe('runSync', () => {
  it('runSync throws when a listing names an unknown product', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const deps = { db, logger, delay: async () => {}, settings: { get: () => undefined } }
    await expect(runSync(deps, [{ name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }])).rejects.toThrow('unknown product: x')
  })
})
