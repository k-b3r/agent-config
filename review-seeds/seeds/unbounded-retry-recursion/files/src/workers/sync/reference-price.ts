import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const RETRY_DELAY_MS = 1000

// Rejects only on connection errors; an HTTP answer such as an unknown name resolves as null.
export interface ReferenceApi {
  fetchPrice(name: string): Promise<number | null>
}

export interface ReferenceDeps {
  api: ReferenceApi
  delay: DelayFn
  logger: Logger
}

export async function fetchReferencePrice(deps: ReferenceDeps, name: string): Promise<number | null> {
  try {
    return await deps.api.fetchPrice(name)
  } catch (error) {
    deps.logger.warn('reference price lookup failed, trying again', { name, error: String(error) })
    await deps.delay(RETRY_DELAY_MS)
    return fetchReferencePrice(deps, name)
  }
}
