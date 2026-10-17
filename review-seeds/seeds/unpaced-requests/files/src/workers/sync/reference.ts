import type { Logger } from '../../platform/logger'

export interface ReferenceApi {
  fetchPrice(name: string): Promise<number | null>
}

// One request per product name; names the API does not know are logged and left out.
export async function fetchReferencePrices(api: ReferenceApi, logger: Logger, names: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  for (const name of names) {
    const price = await api.fetchPrice(name)
    if (price === null) {
      logger.warn('no reference price', { name })
      continue
    }
    prices.set(name, price)
  }
  return prices
}
