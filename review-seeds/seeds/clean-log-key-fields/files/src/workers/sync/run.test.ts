import { runSync } from './run'

async function skippedWarning(name: string): Promise<unknown[]> {
  const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
  const logger = { info: vi.fn(), warn: vi.fn() }
  await runSync({ db, logger, delay: async () => {}, settings: { get: () => undefined } }, [{ name, price: 500, referencePrice: 900, day: '2026-10-17' }])
  return logger.warn.mock.calls[0]
}

describe('runSync', () => {
  it('runSync skips a listing whose product is unknown and logs the name and normalized lookup key', async () => {
    expect(await skippedWarning(' iPhone  12 ')).toEqual([
      'skipped listing: unknown product',
      { name: ' iPhone  12 ', lookupKey: 'iphone 12' },
    ])
  })

  it('runSync logs an empty lookup key when the listing name is blank', async () => {
    expect(await skippedWarning('   ')).toEqual(['skipped listing: unknown product', { name: '   ', lookupKey: '' }])
  })
})
