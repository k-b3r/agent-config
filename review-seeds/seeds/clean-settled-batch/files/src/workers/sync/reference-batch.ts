import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const BATCH_SIZE = 5
// Confirmed live 2026-10-10: the reference API answers in about 40ms per name and 429s past 60 calls a minute (one a second).
// A five-name batch answers in about 40ms, then waits this slot; a failed lookup waits the same slot before its retry, so
// five calls a slot is about 50 calls a minute, inside that ceiling even when a batch has to retry twice.
const PACE_MS = 6000
const MAX_ATTEMPTS = 3
const FATAL_STATUSES = new Set([401, 403])

// Auth answers and an exhausted quota do not clear on a retry, so both reject the fetch instead of being retried.
export class ReferenceApiError extends Error {
  constructor(readonly status: number, readonly quotaExhausted = false) {
    super(`reference api answered ${status}`)
  }
}

export interface ReferenceDeps {
  fetchPrice(name: string): Promise<number | null>
  delay: DelayFn
  logger: Logger
}

const isFatal = (error: unknown): boolean =>
  error instanceof ReferenceApiError && (FATAL_STATUSES.has(error.status) || error.quotaExhausted)

// Fetches the names a batch at a time. A name that keeps failing transiently is left out of the result and counted,
// never silently kept: its skip is logged with the reason, the closing summary reports the fetched and failed counts,
// and the caller retries the name on the next run. Fatal errors reject the fetch instead of being retried.
export async function fetchReferencePrices(deps: ReferenceDeps, names: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  let failed = 0
  for (let start = 0; start < names.length; start += BATCH_SIZE) {
    const batch = names.slice(start, start + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map((name) => fetchWithRetry(deps, name)))
    results.forEach((result, i) => {
      if (result.status === 'rejected' && isFatal(result.reason)) throw result.reason
      if (result.status === 'fulfilled' && result.value !== null) prices.set(batch[i], result.value)
      else {
        failed += 1
        deps.logger.warn('reference price skipped', { name: batch[i], reason: result.status === 'rejected' ? String(result.reason) : 'no price' })
      }
    })
    if (start + BATCH_SIZE < names.length) await deps.delay(PACE_MS)
  }
  deps.logger.info('reference prices fetched', { fetched: prices.size, failed, total: names.length })
  return prices
}

async function fetchWithRetry(deps: ReferenceDeps, name: string): Promise<number | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.fetchPrice(name)
    } catch (error) {
      if (isFatal(error) || attempt >= MAX_ATTEMPTS) throw error
      deps.logger.warn('reference price lookup failed, retrying', { name, attempt, reason: String(error) })
      await deps.delay(PACE_MS)
    }
  }
}
