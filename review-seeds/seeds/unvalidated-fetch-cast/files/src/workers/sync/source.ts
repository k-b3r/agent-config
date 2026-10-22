import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'
import type { Listing } from './run'

export const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 1000

export interface SourceDeps {
  fetchFn: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
  logger: Logger
  delay: DelayFn
}

// Listings the price source publishes. Retries a failing request up to MAX_ATTEMPTS, then logs and answers [] so the run skips this source.
export async function fetchListings(deps: SourceDeps, url: string): Promise<Listing[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await deps.fetchFn(url)
      if (res.ok) return (await res.json()) as Listing[]
      deps.logger.warn('price source answered with an error status', { url, status: res.status, attempt })
    } catch (error) {
      deps.logger.warn('price source request failed', { url, attempt, reason: String(error) })
    }
    if (attempt < MAX_ATTEMPTS) await deps.delay(RETRY_DELAY_MS)
  }
  deps.logger.warn('skipped price source: retries exhausted', { url })
  return []
}
