import { shouldAlert } from './alert-service'

const dbWith = (rows: Record<string, unknown>[]) => ({ query: vi.fn().mockResolvedValue({ rows }) })

describe('shouldAlert', () => {
  it('shouldAlert is true when the new price is below the alert amount', async () => {
    expect(await shouldAlert(dbWith([{ below_amount: 800 }]), 7, 799)).toBe(true)
  })
  it('shouldAlert is false when the new price equals the alert amount', async () => {
    expect(await shouldAlert(dbWith([{ below_amount: 800 }]), 7, 800)).toBe(false)
  })
  it('shouldAlert is false when the product has no alert', async () => {
    expect(await shouldAlert(dbWith([]), 7, 1)).toBe(false)
  })
})
