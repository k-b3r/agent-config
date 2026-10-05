import assert from 'node:assert/strict'
import { test } from 'node:test'
import { billedMinutes, collect, formatReport, summarize } from './ci-report.mjs'

const job = (name, seconds, extra = {}) => ({
  name,
  conclusion: 'success',
  started_at: '2026-10-05T00:00:00Z',
  completed_at: new Date(Date.parse('2026-10-05T00:00:00Z') + seconds * 1000).toISOString(),
  ...extra,
})

test('billedMinutes rounds each job up to a whole minute and bills skipped or unstarted jobs nothing', () => {
  assert.equal(billedMinutes(job('a', 5)), 1)
  assert.equal(billedMinutes(job('a', 61)), 2)
  assert.equal(billedMinutes(job('a', 120)), 2)
  assert.equal(billedMinutes(job('a', 0, { conclusion: 'skipped' })), 0)
  assert.equal(billedMinutes({ name: 'a', conclusion: null, started_at: null, completed_at: null }), 0)
})

test('summarize totals billed minutes per workflow, job and branch, and counts re-runs', () => {
  const runs = [
    { id: 1, name: 'ci', head_branch: 'buy-30', run_attempt: 1 },
    { id: 2, name: 'pr-review', head_branch: 'buy-30', run_attempt: 2 },
    { id: 3, name: 'ci', head_branch: 'buy-31', run_attempt: 1 },
  ]
  const jobsByRun = {
    1: [job('ci / static checks', 90), job('ci / unit tests', 30)],
    2: [job('review / agent-review', 200), job('review / approve', 0, { conclusion: 'skipped' })],
    3: [job('ci / static checks', 50)],
  }
  const summary = summarize(runs, jobsByRun)
  assert.equal(summary.total, 8)
  assert.deepEqual(summary.byWorkflow, { ci: { minutes: 4, runs: 2, reruns: 0 }, 'pr-review': { minutes: 4, runs: 1, reruns: 1 } })
  assert.deepEqual(summary.byJob, { 'ci / static checks': 3, 'ci / unit tests': 1, 'review / agent-review': 4 })
  assert.deepEqual(summary.byBranch, { 'buy-30': 7, 'buy-31': 1 })
})

test('formatReport lists sections sorted by minutes, biggest first', () => {
  const text = formatReport(
    { total: 5, byWorkflow: { ci: { minutes: 1, runs: 1, reruns: 0 }, e2e: { minutes: 4, runs: 1, reruns: 1 } }, byJob: {}, byBranch: {} },
    '2026-09-28',
  )
  assert.match(text, /since 2026-09-28: 5 billed min/)
  assert.ok(text.indexOf('e2e') < text.indexOf('ci'))
  assert.match(text, /e2e\s+4 min\s+1 runs\s+1 re-runs/)
})

test('collect pages runs since the date and fetches every attempt of each run’s jobs', () => {
  const calls = []
  const gh = (args) => {
    calls.push(args.join(' '))
    if (args[1].includes('/actions/runs?')) return '{"id":1,"name":"ci","head_branch":"b","run_attempt":2}\n'
    return JSON.stringify(job('ci / unit tests', 30)) + '\n'
  }
  const { runs, jobsByRun } = collect({ repo: 'o/r', since: '2026-09-28', gh })
  assert.equal(runs.length, 1)
  assert.equal(jobsByRun[1].length, 1)
  assert.match(calls[0], /repos\/o\/r\/actions\/runs\?created=>=2026-09-28&per_page=100 --paginate/)
  assert.match(calls[1], /repos\/o\/r\/actions\/runs\/1\/jobs\?filter=all&per_page=100 --paginate/)
})
