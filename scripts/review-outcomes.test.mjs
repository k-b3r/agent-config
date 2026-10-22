import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify, collect, formatReport, summarize } from './review-outcomes.mjs'

const labeled = (name) => ({ event: 'labeled', label: { name } })
const commit = (parents = 1) => ({ event: 'committed', parents: Array.from({ length: parents }, () => ({})) })
const unlabeled = (name) => ({ event: 'unlabeled', label: { name } })

test('classify calls a PR the review never touched clean', () => {
  assert.equal(classify([]), 'clean')
  assert.equal(classify([{ event: 'assigned' }, labeled('automerge')]), 'clean')
})

test('classify calls a blocked PR fixed once the agent removed the block label', () => {
  assert.equal(classify([labeled('agent-changes-requested'), unlabeled('agent-changes-requested')]), 'fixed')
})

test('classify calls a flagged PR approved-past when a human approved it, even if the block label was later removed', () => {
  const events = [labeled('needs-human'), labeled('human-approved'), unlabeled('needs-human')]
  assert.equal(classify(events), 'approved-past')
  assert.equal(
    classify([labeled('agent-changes-requested'), labeled('human-approved'), unlabeled('agent-changes-requested')]),
    'approved-past',
  )
})

test('classify calls a code push after approval early-approve, even when the new commit removed human-approved', () => {
  const events = [labeled('needs-human'), labeled('human-approved'), commit(), unlabeled('human-approved')]
  assert.equal(classify(events), 'early-approve')
})

test('classify ignores commits before approval and merges of main after it', () => {
  assert.equal(classify([commit(), labeled('human-approved')]), 'approved-past')
  assert.equal(classify([labeled('human-approved'), commit(2)]), 'approved-past')
})

test('classify keeps a PR merged with the block label still on, or only needs-human, as flagged-other', () => {
  assert.equal(classify([labeled('agent-changes-requested')]), 'flagged-other')
  assert.equal(classify([labeled('needs-human')]), 'flagged-other')
})

test('summarize counts outcomes per bucket and has no precision figure', () => {
  const summary = summarize({
    1: [],
    2: [labeled('agent-changes-requested'), unlabeled('agent-changes-requested')],
    3: [labeled('needs-human'), labeled('human-approved'), commit()],
    4: [labeled('needs-human'), labeled('human-approved')],
  })
  assert.deepEqual(summary.counts, { clean: 1, fixed: 1, 'early-approve': 1, 'approved-past': 1, 'flagged-other': 0 })
  assert.equal('precision' in summary, false)
})

test('formatReport lists the approval buckets without a precision line', () => {
  const text = formatReport(
    summarize({ 7: [labeled('human-approved')], 8: [labeled('human-approved'), commit()], 9: [] }),
    '2026-09-12',
  )
  assert.match(text, /merged since 2026-09-12: 3/)
  assert.match(text, /approved-past: #7/)
  assert.match(text, /early-approve: #8/)
  assert.match(text, /approved-past \(unclassified\)/)
  assert.match(text, /not proof the review was wrong/)
  assert.doesNotMatch(text, /[Pp]recision/)
})

test('collect lists merged PRs inside the window and reads each one\'s events', () => {
  const calls = []
  const gh = (args) => {
    calls.push(args[1])
    if (args[1].includes('/pulls?')) {
      return [
        JSON.stringify({ number: 5, merged_at: '2026-10-01T00:00:00Z' }),
        JSON.stringify({ number: 6, merged_at: '2026-08-01T00:00:00Z' }),
      ].join('\n')
    }
    return JSON.stringify({ event: 'labeled', label: { name: 'needs-human' } })
  }
  const result = collect({ repo: 'o/r', since: '2026-09-12', gh })
  assert.deepEqual(Object.keys(result), ['5'])
  assert.equal(result[5][0].label.name, 'needs-human')
  assert.ok(calls.some((c) => c.startsWith('repos/o/r/issues/5/timeline')))
})
