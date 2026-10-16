import { register } from '../../platform/registry'
import { latestPrice } from './latest'

describe('latestPrice', () => {
  it('latestPrice returns the newest amount for the product', async () => {
    register('db', { query: vi.fn().mockResolvedValue({ rows: [{ amount: 900 }] }) })
    register('logger', { info: vi.fn(), warn: vi.fn() })
    expect(await latestPrice(7)).toBe(900)
  })
})
