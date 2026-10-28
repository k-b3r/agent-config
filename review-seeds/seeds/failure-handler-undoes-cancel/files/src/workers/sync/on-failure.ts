import type { Logger } from '../../platform/logger'
import { moveJob, type JobStore } from './job-state'

const MAX_ATTEMPTS = 3

export interface FailureDeps {
  store: JobStore
  logger: Logger
}

// Called by the worker when a sync attempt throws, whatever the reason.
export async function handleFailure(deps: FailureDeps, job: { id: string; attempt: number }, reason: string): Promise<void> {
  if (job.attempt < MAX_ATTEMPTS) {
    deps.logger.info('sync job back to queued', { jobId: job.id, attempt: job.attempt, reason })
    await moveJob(deps.store, job.id, 'queued')
    return
  }
  deps.logger.warn('sync job failed after retries', { jobId: job.id, attempts: job.attempt, reason })
  await moveJob(deps.store, job.id, 'failed')
}
