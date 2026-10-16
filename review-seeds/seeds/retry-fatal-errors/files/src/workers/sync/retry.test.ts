import { withRetry } from './retry'

const deps = () => ({ delay: async () => {}, logger: { info: vi.fn(), warn: vi.fn() } })

describe('withRetry', () => {
  it('withRetry returns the result after a transient failure', async () => {
    const call = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(900)
    expect(await withRetry(call, deps())).toBe(900)
  })
  it('withRetry throws the last error once attempts run out', async () => {
    const call = vi.fn().mockRejectedValue(new Error('timeout'))
    await expect(withRetry(call, deps())).rejects.toThrow('timeout')
    expect(call).toHaveBeenCalledTimes(5)
  })
})
