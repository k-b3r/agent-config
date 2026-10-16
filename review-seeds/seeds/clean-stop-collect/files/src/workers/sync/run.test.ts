import { runSync } from './run'

describe('runSync', () => {
  it('runSync skips a listing whose product is unknown and logs why', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [{ name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }])
    expect(logger.warn).toHaveBeenCalledWith('skipped listing: unknown product', { name: 'x' })
  })
  it('runSync stops before the next listing once shouldStop returns true', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const shouldStop = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    const listing = { name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined }, shouldStop }, [listing, listing])
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('sync stopped early: shutdown requested', { remaining: 2 })
  })
})
