import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const MAX_ATTEMPTS = 4
const RETRY_DELAY_MS = 1000
const NETWORK_ERROR_STATUS = 0
const RETRY_STATUSES = new Set([NETWORK_ERROR_STATUS, 401, 403, 429, 500, 502, 503])

// fetchStatus never rejects: a failed connection resolves with NETWORK_ERROR_STATUS.
export interface ReferenceDeps {
  fetchStatus(name: string): Promise<{ status: number; price: number | null }>
  delay: DelayFn
  logger: Logger
}

export async function fetchReferencePrice(deps: ReferenceDeps, name: string): Promise<number | null> {
  let lastStatus = NETWORK_ERROR_STATUS
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { status, price } = await deps.fetchStatus(name)
    lastStatus = status
    if (status === 200) {
      if (price !== null) return price
      deps.logger.warn('reference price lookup returned no price, skipped', { name, status })
      return null
    }
    if (!RETRY_STATUSES.has(status)) {
      deps.logger.warn('reference price lookup rejected, skipped', { name, status })
      return null
    }
    if (attempt < MAX_ATTEMPTS) await deps.delay(RETRY_DELAY_MS)
  }
  deps.logger.warn('reference price lookup kept failing, skipped', { name, attempts: MAX_ATTEMPTS, status: lastStatus })
  return null
}
