import { startRefresh } from './index'

describe('startRefresh', () => {
  it('startRefresh logs a deep discount for a known product', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    const logger = { info: vi.fn(), warn: vi.fn() }
    await startRefresh(db, logger, async () => {}, [{ name: 'iPhone 12', price: 500, referencePrice: 1000 }])
    expect(logger.info).toHaveBeenCalledWith('deep discount', { productId: 7, discount: 50 })
  })
})
