import type { JobState } from './job-state'
import { handleFailure } from './on-failure'

const setup = (state: JobState) => {
  const store = { state: async () => state, save: vi.fn().mockResolvedValue(undefined) }
  const logger = { info: vi.fn(), warn: vi.fn() }
  return { deps: { store, logger }, store, logger }
}

describe('handleFailure', () => {
  it('handleFailure puts a failed running job back to queued while attempts remain', async () => {
    const { deps, store } = setup('running')
    await handleFailure(deps, { id: 'job-1', attempt: 1 }, 'timeout')
    expect(store.save).toHaveBeenCalledWith('job-1', 'queued')
  })
  it('handleFailure marks the job failed and logs once the attempts run out', async () => {
    const { deps, store, logger } = setup('running')
    await handleFailure(deps, { id: 'job-1', attempt: 3 }, 'timeout')
    expect(store.save).toHaveBeenCalledWith('job-1', 'failed')
    expect(logger.warn).toHaveBeenCalledWith('sync job failed after retries', { jobId: 'job-1', attempts: 3, reason: 'timeout' })
  })
})
