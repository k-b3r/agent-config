import { canMove, moveJob, type JobState } from './job-state'

const storeIn = (state: JobState) => ({ state: async () => state, save: vi.fn().mockResolvedValue(undefined) })

describe('job state machine', () => {
  it('canMove lets an operator retry a cancelled job and refuses to reopen a done one', () => {
    expect(canMove('cancelled', 'queued')).toBe(true)
    expect(canMove('done', 'queued')).toBe(false)
  })
  it('moveJob saves the new state along an allowed edge', async () => {
    const store = storeIn('running')
    await moveJob(store, 'job-1', 'done')
    expect(store.save).toHaveBeenCalledWith('job-1', 'done')
  })
  it('moveJob throws and saves nothing when the edge is not allowed', async () => {
    const store = storeIn('done')
    await expect(moveJob(store, 'job-1', 'queued')).rejects.toThrow('no edge done -> queued')
    expect(store.save).not.toHaveBeenCalled()
  })
})
