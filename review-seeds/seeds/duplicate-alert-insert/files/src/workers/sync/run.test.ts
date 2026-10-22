import { runSync } from './run'

const listing = { name: 'x', price: 500, referencePrice: 900, day: '2026-10-17' }

describe('runSync', () => {
  it('runSync skips a listing whose product is unknown and logs why', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [listing])
    expect(logger.warn).toHaveBeenCalledWith('skipped listing: unknown product', { name: 'x' })
  })

  it('runSync queues a price alert for a deep discount when both settings are on', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await runSync({ db, logger, delay: async () => {}, settings: { get: () => 1 } }, [listing])
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO price_alerts'), [7, 500, '2026-10-17'])
  })

  it('runSync queues no alert when the alert setting is off', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const settings = { get: (key: string) => (key === 'sync.save_prices_enabled' ? 1 : undefined) }
    await runSync({ db, logger, delay: async () => {}, settings }, [listing])
    expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('price_alerts'), expect.anything())
  })
})
