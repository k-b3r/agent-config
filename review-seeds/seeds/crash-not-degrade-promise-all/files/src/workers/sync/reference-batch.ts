import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const BATCH_SIZE = 5
const PAUSE_BETWEEN_BATCHES_MS = 500
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 1000

// 429 and auth answers do not clear on a retry; unwinding is cheaper than burning the rest of the budget.
export class QuotaExhaustedError extends Error {}

export interface ReferenceApi {
  fetchPrice(name: string): Promise<number | null>
}

type ReferenceDeps = { api: ReferenceApi; delay: DelayFn; logger: Logger }

// Names the API does not know are logged and left out of the result.
export async function fetchReferencePrices(deps: ReferenceDeps, names: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  for (let start = 0; start < names.length; start += BATCH_SIZE) {
    const batch = names.slice(start, start + BATCH_SIZE)
    const answers = await Promise.all(batch.map((name) => fetchWithRetry(deps, name)))
    batch.forEach((name, i) => {
      const price = answers[i]
      if (price === null) deps.logger.warn('no reference price', { name })
      else prices.set(name, price)
    })
    if (start + BATCH_SIZE < names.length) await deps.delay(PAUSE_BETWEEN_BATCHES_MS)
  }
  return prices
}

async function fetchWithRetry(deps: ReferenceDeps, name: string): Promise<number | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.api.fetchPrice(name)
    } catch (error) {
      if (error instanceof QuotaExhaustedError || attempt >= MAX_ATTEMPTS) throw error
      deps.logger.warn('reference price lookup failed, retrying', { name, attempt })
      await deps.delay(RETRY_DELAY_MS)
    }
  }
}
