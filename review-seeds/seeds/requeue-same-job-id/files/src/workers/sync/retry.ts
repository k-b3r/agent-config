import type { Logger } from '../../platform/logger'

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 30_000

export interface SyncJob {
  id: string
  listingName: string
  attempt: number
}

export interface JobQueue {
  add(name: string, data: SyncJob, options: { jobId: string; delayMs: number }): Promise<void>
}

export interface RetryDeps {
  queue: JobQueue
  logger: Logger
}

// Called from the worker's handler when a sync job throws.
export async function retryFailedJob(deps: RetryDeps, job: SyncJob, reason: string): Promise<void> {
  if (job.attempt >= MAX_ATTEMPTS) {
    deps.logger.warn('sync job gave up after retries', { jobId: job.id, attempts: job.attempt, reason })
    return
  }
  deps.logger.info('sync job queued for retry', { jobId: job.id, attempt: job.attempt + 1, reason })
  await deps.queue.add('sync', { ...job, attempt: job.attempt + 1 }, { jobId: job.id, delayMs: RETRY_DELAY_MS })
}
