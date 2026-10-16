import { realDelay } from '../../platform/delay'
import type { DbClient } from '../../platform/db'
import type { Logger } from '../../platform/logger'
import type { Settings } from '../../platform/settings'
import { runSync } from './run'

// Wiring only: build dependencies, then hand them to the loop.
export function startSync(
  db: DbClient,
  logger: Logger,
  settings: Settings,
  source: { url: string; apiKey: string },
): Promise<void> {
  logger.info('starting sync', { url: source.url, apiKey: source.apiKey })
  return runSync({ db, logger, delay: realDelay, settings })
}
