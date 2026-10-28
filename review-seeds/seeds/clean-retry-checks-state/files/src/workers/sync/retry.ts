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

export interface JobStore {
  // Moves the job only if it is in `from` now; false when another actor (a cancel) changed it first.
  moveFrom(id: string, from: 'running' | 'queued', to: 'queued' | 'failed'): Promise<boolean>
}

export interface RetryDeps {
  queue: JobQueue
  store: JobStore
  logger: Logger
}

// Called from the worker's handler when a sync job throws.
export async function retryFailedJob(deps: RetryDeps, job: SyncJob, reason: string): Promise<void> {
  const last = job.attempt >= MAX_ATTEMPTS
  if (!(await deps.store.moveFrom(job.id, 'running', last ? 'failed' : 'queued'))) {
    deps.logger.info('sync job not retried: it is no longer running', { jobId: job.id, attempt: job.attempt, reason })
    return
  }
  if (last) {
    deps.logger.warn('sync job gave up after retries', { jobId: job.id, attempts: job.attempt, reason })
    return
  }
  deps.logger.info('sync job queued for retry', { jobId: job.id, attempt: job.attempt + 1, reason })
  // A new id per attempt: the queue ignores an add whose id it already holds, and this runs inside the handler of the job it retries.
  try {
    await deps.queue.add('sync', { ...job, attempt: job.attempt + 1 }, { jobId: `${job.id}:${job.attempt + 1}`, delayMs: RETRY_DELAY_MS })
  } catch (error) {
    // The job is already queued in the store; mark it failed so it is not left waiting for a queue entry that does not exist.
    deps.logger.warn('sync job could not be added to the queue', { jobId: job.id, attempt: job.attempt + 1, reason: String(error) })
    await deps.store.moveFrom(job.id, 'queued', 'failed')
  }
}
