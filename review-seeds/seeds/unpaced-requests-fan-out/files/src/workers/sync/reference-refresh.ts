import type { Logger } from '../../platform/logger'

// Resolves null for a name it does not know and for a request that failed; it logs and retries those itself.
export interface ReferenceApi {
  fetchPrice(name: string): Promise<number | null>
}

export async function refreshReferencePrices(api: ReferenceApi, logger: Logger, names: string[]): Promise<Map<string, number>> {
  const answers = await Promise.all(names.map((name) => api.fetchPrice(name)))
  const prices = new Map<string, number>()
  names.forEach((name, i) => {
    const price = answers[i]
    if (price === null) logger.warn('no reference price', { name })
    else prices.set(name, price)
  })
  return prices
}
