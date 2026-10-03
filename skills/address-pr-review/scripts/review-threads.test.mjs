import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { summarizeReview } from './review-threads.mjs'

const comment = (login, body, extra = {}) => ({ databaseId: 1, author: { login }, body, url: `u/${body}`, ...extra })
const thread = (id, { isResolved = false, isOutdated = false, path = 'a.ts', line = 1, comments }) => ({
  id,
  isResolved,
  isOutdated,
  path,
  line,
  comments: { nodes: comments },
})
const pr = ({ threads = [], comments = [], labels = [] }) => ({
  headRefName: 'feature',
  labels: { nodes: labels.map((name) => ({ name })) },
  reviewThreads: { nodes: threads },
  comments: { nodes: comments },
})

test('summarizeReview lists only unresolved threads, with location, author and first comment', () => {
  const result = summarizeReview(
    pr({
      threads: [
        thread('T1', { path: 'src/a.ts', line: 8, comments: [comment('claude', 'anchor bug')] }),
        thread('T2', { isResolved: true, comments: [comment('claude', 'already fixed')] }),
      ],
    }),
  )
  assert.deepEqual(result.threads, [
    { id: 'T1', path: 'src/a.ts', line: 8, outdated: false, author: 'claude', body: 'anchor bug', url: 'u/anchor bug', replies: [] },
  ])
})

test('summarizeReview keeps later comments in a thread as replies so earlier answers are not repeated', () => {
  const result = summarizeReview(
    pr({ threads: [thread('T1', { comments: [comment('claude', 'bug'), comment('k-b3r', 'disagree, see x')] })] }),
  )
  assert.deepEqual(result.threads[0].replies, [{ author: 'k-b3r', body: 'disagree, see x' }])
})

test('summarizeReview picks the latest summary comment from a thread author, skipping other bots', () => {
  const result = summarizeReview(
    pr({
      threads: [thread('T1', { comments: [comment('claude', 'bug')] })],
      comments: [comment('claude', 'old summary'), comment('claude', 'new summary'), comment('vercel', 'deploy table')],
    }),
  )
  assert.equal(result.summary.body, 'new summary')
})

test('summarizeReview falls back to the claude reviewer for the summary when no threads are open', () => {
  const result = summarizeReview(pr({ comments: [comment('claude', 'No issues found.'), comment('vercel', 'x')] }))
  assert.equal(result.summary.body, 'No issues found.')
  assert.deepEqual(result.threads, [])
})

test('summarizeReview reports branch and labels so a needs-human PR can stop the run', () => {
  const result = summarizeReview(pr({ labels: ['needs-human'] }))
  assert.equal(result.branch, 'feature')
  assert.deepEqual(result.labels, ['needs-human'])
  assert.equal(result.summary, null)
})

test('the script runs when invoked through a symlink, as ~/.claude/skills links it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-threads-'))
  const link = join(dir, 'review-threads.mjs')
  symlinkSync(fileURLToPath(new URL('./review-threads.mjs', import.meta.url)), link)
  const run = spawnSync(process.execPath, [link], { encoding: 'utf8' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /usage:/)
})
