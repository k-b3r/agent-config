import { realDelay } from '../../platform/delay'
import type { DbClient } from '../../platform/db'
import { parseLimitArg } from '../../platform/limit-arg'
import type { Logger } from '../../platform/logger'
import type { Settings } from '../../platform/settings'
import { runSync } from './run'

// Wiring only: build dependencies, then hand them to the loop.
export function startSync(db: DbClient, logger: Logger, settings: Settings, limitArg?: string): Promise<void> {
  return runSync({ db, logger, delay: realDelay, settings, limit: parseLimitArg(limitArg) })
}
