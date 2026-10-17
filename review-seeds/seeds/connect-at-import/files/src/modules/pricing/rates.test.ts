vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ EUR: 0.9 }) }))
const { loadRates } = await import('./rates')

describe('loadRates', () => {
  it('loadRates returns the rate table from the rates service', async () => {
    const http = vi.fn().mockResolvedValue({ json: async () => ({ EUR: 0.92, GBP: 0.8 }) })
    expect(await loadRates(http as unknown as typeof fetch)).toEqual({ EUR: 0.92, GBP: 0.8 })
  })
})
