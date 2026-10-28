import { retryFailedJob } from './retry'

const setup = (moved = true) => {
  const queue = { add: vi.fn().mockResolvedValue(undefined) }
  const store = { moveFrom: vi.fn().mockResolvedValue(moved) }
  const logger = { info: vi.fn(), warn: vi.fn() }
  return { deps: { queue, store, logger }, queue, store, logger }
}
const job = { id: 'job-7', listingName: 'iphone 12', attempt: 1 }

describe('retryFailedJob', () => {
  it('retryFailedJob queues the next attempt under its own id after the retry delay', async () => {
    const { deps, queue, store } = setup()
    await retryFailedJob(deps, job, 'timeout')
    expect(store.moveFrom).toHaveBeenCalledWith('job-7', 'running', 'queued')
    expect(queue.add).toHaveBeenCalledWith('sync', { ...job, attempt: 2 }, { jobId: 'job-7:2', delayMs: 30_000 })
  })
  it('retryFailedJob leaves a cancelled job alone and enqueues nothing', async () => {
    const { deps, queue, logger } = setup(false)
    await retryFailedJob(deps, job, 'aborted')
    expect(queue.add).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith('sync job not retried: it is no longer running', { jobId: 'job-7', attempt: 1, reason: 'aborted' })
  })
  it('retryFailedJob marks the job failed and logs when the queue refuses the retry', async () => {
    const { deps, queue, store, logger } = setup()
    queue.add.mockRejectedValue(new Error('redis down'))
    await retryFailedJob(deps, job, 'timeout')
    expect(store.moveFrom).toHaveBeenLastCalledWith('job-7', 'queued', 'failed')
    expect(logger.warn).toHaveBeenCalledWith('sync job could not be added to the queue', { jobId: 'job-7', attempt: 2, reason: 'Error: redis down' })
  })
  it('retryFailedJob marks the job failed and logs once the attempts run out', async () => {
    const { deps, queue, store, logger } = setup()
    await retryFailedJob(deps, { ...job, attempt: 3 }, 'timeout')
    expect(store.moveFrom).toHaveBeenCalledWith('job-7', 'running', 'failed')
    expect(queue.add).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith('sync job gave up after retries', { jobId: 'job-7', attempts: 3, reason: 'timeout' })
  })
})
