import { runSync } from './run'

const LISTING = { name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }

describe('runSync', () => {
  it('runSync skips a listing whose product is unknown and logs why', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {} }, [LISTING])
    expect(logger.warn).toHaveBeenCalledWith('skipped listing: unknown product', { name: 'x' })
  })
  it('runSync saves the price of a known product with a valid discount', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 7 }] }).mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {} }, [LISTING])
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO prices'), [7, 500, '2026-10-17'])
  })
})
