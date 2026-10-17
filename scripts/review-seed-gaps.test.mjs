import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reviewRules, uncoveredRules } from './review-seed-gaps.mjs'

const STANDARDS = [
  '## Design',
  '',
  '- `review` Deep modules: simple interface, substantial functionality behind it.',
  '- `tool` Every runnable script has a named command.',
  '- `tool`+`review` Hide information. Each module owns its decisions. _(no deep imports)_',
  '- `process` TDD by default.',
  '- `review` Make operations idempotent wherever retries or reruns can happen.',
].join('\n')

test('reviewRules lists review and tool+review rules with their section, and skips tool, process and hint', () => {
  assert.deepEqual(
    reviewRules(STANDARDS).map((r) => r.text.slice(0, 12)),
    ['Deep modules', 'Hide informa', 'Make operati'],
  )
  assert.equal(reviewRules(STANDARDS)[0].section, 'Design')
})

test('uncoveredRules reports rules no seed covers, ignoring backticks and case', () => {
  const rules = reviewRules(STANDARDS)
  const seeds = [{ name: 's1', covers: 'deep modules: simple interface' }, { name: 'c', covers: null }]
  assert.deepEqual(uncoveredRules(rules, seeds, []).map((r) => r.text.slice(0, 12)), ['Hide informa', 'Make operati'])
})

test('uncoveredRules leaves out rules the allowlist excuses, and reports allowlist entries that match no rule', () => {
  const rules = reviewRules(STANDARDS)
  const result = uncoveredRules(rules, [], [{ match: 'Hide information', reason: 'judgment only' }, { match: 'gone rule', reason: 'x' }])
  assert.deepEqual(result.map((r) => r.text.slice(0, 12)), ['Deep modules', 'Make operati'])
  assert.deepEqual(result.stale, ['gone rule'])
})
