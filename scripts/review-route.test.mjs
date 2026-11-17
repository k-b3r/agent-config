import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fallbackDecision, pickReviewer } from './review-route.mjs'

test('pickReviewer runs DeepSeek for a deepseek-tier PR when the key is set', () => {
  assert.deepEqual(pickReviewer({ tier: 'deepseek', hasDeepseekKey: true }), { primary: 'deepseek', canFallback: false, note: '' })
})

test('pickReviewer runs Claude for a deepseek-tier PR when the key is missing, and says so', () => {
  const route = pickReviewer({ tier: 'deepseek', hasDeepseekKey: false })
  assert.equal(route.primary, 'claude')
  assert.equal(route.canFallback, false)
  assert.match(route.note, /OPENCODE_API_KEY/)
})

test('pickReviewer runs Claude for a claude-tier PR and allows the DeepSeek fallback only with the key', () => {
  assert.deepEqual(pickReviewer({ tier: 'claude', hasDeepseekKey: true }), { primary: 'claude', canFallback: true, note: '' })
  const noKey = pickReviewer({ tier: 'claude', hasDeepseekKey: false })
  assert.deepEqual([noKey.primary, noKey.canFallback], ['claude', false])
  assert.match(noKey.note, /no fallback/)
})

test('pickReviewer treats an unknown or empty tier as claude, the safe side', () => {
  assert.equal(pickReviewer({ tier: '', hasDeepseekKey: true }).primary, 'claude')
  assert.equal(pickReviewer({ tier: 'weird', hasDeepseekKey: true }).primary, 'claude')
})

const limited = [
  { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
  { type: 'result', is_error: true, result: "You've hit your session limit · resets 6:50pm (UTC)" },
]
const startup = [{ type: 'result', is_error: true, num_turns: 1, total_cost_usd: 0, modelUsage: {}, result: 'Invalid authentication credentials' }]
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })

test('fallbackDecision reruns on DeepSeek after a session limit before any comment was posted', () => {
  assert.deepEqual(fallbackDecision(limited), { run: true, reason: 'Claude session limit' })
})

test('fallbackDecision reruns after a start-up failure: error result, no cost, no tool call', () => {
  assert.deepEqual(fallbackDecision(startup), { run: true, reason: 'Claude failed at start-up' })
})

test('fallbackDecision keeps today\'s failure for any other Claude error', () => {
  const other = [{ type: 'result', is_error: true, num_turns: 12, total_cost_usd: 0.4, modelUsage: { 'claude-sonnet-5-5': {} }, result: 'Execution error' }]
  assert.equal(fallbackDecision(other).run, false)
  assert.equal(fallbackDecision([{ type: 'result', is_error: false, result: 'done' }]).run, false)
})

test('fallbackDecision does not rerun when Claude already posted a comment or edited a label, to avoid duplicates', () => {
  for (const call of [
    tool('mcp__github_inline_comment__create_inline_comment', { body: 'x' }),
    tool('Bash', { command: 'gh pr comment 7 --body hi' }),
    tool('Bash', { command: 'gh pr edit 7 --add-label needs-human' }),
  ]) {
    const decision = fallbackDecision([call, ...limited])
    assert.equal(decision.run, false)
    assert.match(decision.reason, /already/)
  }
  assert.equal(fallbackDecision([tool('Bash', { command: 'gh pr diff 7' }), ...limited]).run, true)
})

test('fallbackDecision does not rerun when there is no transcript to judge', () => {
  assert.equal(fallbackDecision(null).run, false)
  assert.equal(fallbackDecision([]).run, false)
})
