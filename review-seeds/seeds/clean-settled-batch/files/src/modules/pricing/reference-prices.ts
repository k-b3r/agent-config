import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const BATCH_SIZE = 5
// Confirmed live 2026-10-10: the reference API answers in about 40ms per name and 429s past 60 calls a minute.
// The calls of a batch run together; the pause after a batch (and before a retry) is this slot, so one slot of five
// calls is about 50 calls a minute, inside that ceiling even when a batch has to retry twice.
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
  // Resolves null when the API does not know the name (never retried). Rejects with a ReferenceApiError for a 401 or 403
  // and for a 429 that says the quota is used up (quotaExhausted true); any other rejection is retried as transient.
  fetchPrice(name: string): Promise<number | null>
  delay: DelayFn
  logger: Logger
}

export interface ReferencePrices {
  prices: Map<string, number>
  // Names the API does not know: a missing price, retrying will not help.
  unknown: string[]
  // Names whose lookup kept failing transiently: retry them on the next run.
  failed: string[]
}

const isFatal = (error: unknown): boolean =>
  error instanceof ReferenceApiError && (FATAL_STATUSES.has(error.status) || error.quotaExhausted)

// Fetches each distinct name, a batch at a time. Unknown and failed names are returned apart from the prices, logged
// with the reason and counted in the closing summary. A fatal error rejects the fetch and stops the other lookups.
export async function fetchReferencePrices(deps: ReferenceDeps, names: string[]): Promise<ReferencePrices> {
  const distinct = [...new Set(names)]
  const result: ReferencePrices = { prices: new Map(), unknown: [], failed: [] }
  const run = { fatal: null as unknown }
  for (let start = 0; start < distinct.length; start += BATCH_SIZE) {
    const batch = distinct.slice(start, start + BATCH_SIZE)
    const settled = await Promise.allSettled(batch.map((name) => fetchWithRetry(deps, run, name)))
    if (run.fatal !== null) throw run.fatal
    for (const [i, outcome] of settled.entries()) {
      const name = batch[i]
      if (outcome.status === 'fulfilled' && outcome.value !== null) {
        result.prices.set(name, outcome.value)
        continue
      }
      const reason = outcome.status === 'rejected' ? String(outcome.reason) : 'no price'
      deps.logger.warn('reference price skipped', { name, reason })
      if (outcome.status === 'rejected') result.failed.push(name)
      else result.unknown.push(name)
    }
    if (start + BATCH_SIZE < distinct.length) await deps.delay(PACE_MS)
  }
  deps.logger.info('reference prices fetched', { fetched: result.prices.size, unknown: result.unknown.length, failed: result.failed.length, total: distinct.length })
  return result
}

async function fetchWithRetry(deps: ReferenceDeps, run: { fatal: unknown }, name: string): Promise<number | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.fetchPrice(name)
    } catch (error) {
      if (isFatal(error)) run.fatal ??= error
      if (run.fatal !== null || attempt >= MAX_ATTEMPTS) throw error
      deps.logger.warn('reference price lookup failed, retrying', { name, attempt, reason: String(error) })
      await deps.delay(PACE_MS)
    }
  }
}
