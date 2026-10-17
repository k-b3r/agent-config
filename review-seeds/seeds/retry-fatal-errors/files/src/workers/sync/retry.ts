import type { DelayFn } from '../../platform/delay'
import type { Logger } from '../../platform/logger'

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 1000

// Wraps calls to the reference price API, which answers 429 "quota exhausted" once the daily limit is spent.
export async function withRetry<T>(call: () => Promise<T>, deps: { delay: DelayFn; logger: Logger }): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call()
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error
      deps.logger.warn('retrying reference price call', { attempt })
      await deps.delay(RETRY_DELAY_MS)
    }
  }
}
