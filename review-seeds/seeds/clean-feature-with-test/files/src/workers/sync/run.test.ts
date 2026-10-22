import { runSync } from './run'

describe('runSync', () => {
  it('runSync skips a listing whose product is unknown and logs why', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [{ name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }])
    expect(logger.warn).toHaveBeenCalledWith('skipped listing: unknown product', { name: 'x' })
  })
  it('runSync logs a price alert when a drop clears the configured percent', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const settings = { get: (key: string) => (key === 'sync.price_alert_percent' ? 40 : undefined) }
    await runSync({ db, logger, delay: async () => {}, settings }, [{ name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }])
    expect(logger.info).toHaveBeenCalledWith('price alert', { name: 'x', price: 500, referencePrice: 900 })
  })
})
