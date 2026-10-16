import { runSync } from './run'

describe('runSync', () => {
  it('runSync skips a listing whose product is unknown and logs why', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [{ name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }])
    expect(logger.warn).toHaveBeenCalledWith('skipped listing: unknown product', { name: 'x' })
  })
  it('runSync handles the listing with the biggest discount first', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [
      { name: 'small', price: 900, referencePrice: 1000, day: '2026-10-17' },
      { name: 'big', price: 500, referencePrice: 1000, day: '2026-10-17' },
    ])
    expect(logger.warn.mock.calls.map((c) => c[1])).toEqual([{ name: 'big' }, { name: 'small' }])
  })
})
