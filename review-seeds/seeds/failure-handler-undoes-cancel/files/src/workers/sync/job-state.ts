export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

// Edges a job may take. cancelled -> queued is the operator's "retry" button.
const EDGES: Record<JobState, JobState[]> = {
  queued: ['running', 'cancelled'],
  running: ['done', 'failed', 'queued', 'cancelled'],
  failed: ['queued'],
  cancelled: ['queued'],
  done: [],
}

export interface JobStore {
  state(id: string): Promise<JobState>
  save(id: string, state: JobState): Promise<void>
}

export const canMove = (from: JobState, to: JobState): boolean => EDGES[from].includes(to)

// Throws when the state machine has no edge from the job's current state to `to`.
export async function moveJob(store: JobStore, id: string, to: JobState): Promise<void> {
  const from = await store.state(id)
  if (!canMove(from, to)) throw new Error(`job ${id}: no edge ${from} -> ${to}`)
  await store.save(id, to)
}
