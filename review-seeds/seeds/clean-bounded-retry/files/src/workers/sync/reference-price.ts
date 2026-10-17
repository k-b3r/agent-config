import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const MAX_ATTEMPTS = 4
const RETRY_DELAY_MS = 1000
const FATAL_STATUSES = new Set([401, 403])

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

// Fatal errors (auth failure, quota exhausted) unwind to the caller; a name that keeps failing transiently is skipped.
export async function fetchReferencePrice(deps: ReferenceDeps, name: string): Promise<number | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await deps.fetchPrice(name)
    } catch (error) {
      if (isFatal(error)) throw error
      deps.logger.warn('reference price lookup failed', { name, attempt, reason: String(error) })
      if (attempt < MAX_ATTEMPTS) await deps.delay(RETRY_DELAY_MS)
    }
  }
  deps.logger.warn('reference price lookup skipped after retries', { name, attempts: MAX_ATTEMPTS })
  return null
}
