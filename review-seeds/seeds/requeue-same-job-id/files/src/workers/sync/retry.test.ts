import { retryFailedJob } from './retry'

const setup = () => {
  const queue = { add: vi.fn().mockResolvedValue(undefined) }
  const logger = { info: vi.fn(), warn: vi.fn() }
  return { deps: { queue, logger }, queue, logger }
}

describe('retryFailedJob', () => {
  it('retryFailedJob adds the job back with the next attempt number after the retry delay', async () => {
    const { deps, queue } = setup()
    await retryFailedJob(deps, { id: 'job-7', listingName: 'iphone 12', attempt: 1 }, 'timeout')
    expect(queue.add).toHaveBeenCalledWith('sync', { id: 'job-7', listingName: 'iphone 12', attempt: 2 }, { jobId: 'job-7', delayMs: 30_000 })
  })
  it('retryFailedJob gives up and logs once the attempts run out', async () => {
    const { deps, queue, logger } = setup()
    await retryFailedJob(deps, { id: 'job-7', listingName: 'iphone 12', attempt: 3 }, 'timeout')
    expect(queue.add).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith('sync job gave up after retries', { jobId: 'job-7', attempts: 3, reason: 'timeout' })
  })
})
