import { runSync } from './run'

describe('runSync', () => {
  it('runSync skips a listing whose product is unknown and logs why', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [{ name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }])
    expect(logger.warn).toHaveBeenCalledWith('skipped listing: unknown product', { name: 'x' })
  })
  it('runSync logs how many listings are in the batch', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [])
    expect(logger.info).toHaveBeenCalledWith('syncing batch', { size: 0 })
  })
})
