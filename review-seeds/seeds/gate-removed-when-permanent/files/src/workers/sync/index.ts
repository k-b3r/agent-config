import { realDelay } from '../../platform/delay'
import type { DbClient } from '../../platform/db'
import type { Logger } from '../../platform/logger'
import { runSync } from './run'

// Wiring only: build dependencies, then hand them to the loop.
export function startSync(db: DbClient, logger: Logger): Promise<void> {
  return runSync({ db, logger, delay: realDelay })
}
