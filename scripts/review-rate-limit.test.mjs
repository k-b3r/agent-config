import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { describeRateLimit } from './review-rate-limit.mjs'

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/review-rate-limit/session-limit.json', import.meta.url)), 'utf8'),
)

test('describeRateLimit names the five-hour limit and reset time from the transcript fixture', () => {
  const message = describeRateLimit(fixture)
  assert.match(message, /^Agent review rate-limited: the CI Claude token hit its five-hour session limit \(resets 6:50pm \(UTC\)\)\./)
  assert.match(message, /gate stays blocked/)
  assert.match(message, /\/approve/)
})

test('describeRateLimit returns null for a clean review run', () => {
  const clean = [
    { type: 'result', subtype: 'success', is_error: false, result: 'No issues found.' },
  ]
  assert.equal(describeRateLimit(clean), null)
})

test('describeRateLimit ignores a diff that quotes the limit wording in a tool result', () => {
  const quoted = [
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'docs: when you hit your session limit, wait' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'Reviewed docs, no issues.' },
  ]
  assert.equal(describeRateLimit(quoted), null)
})

test('describeRateLimit reads a session-limit error with no rate_limit_info as a generic session limit', () => {
  const message = describeRateLimit([
    { type: 'result', is_error: true, result: "You've hit your session limit · resets 7am (UTC)" },
  ])
  assert.match(message, /hit its session limit/)
  assert.match(message, /resets 7am \(UTC\)/)
})

test('describeRateLimit names a weekly limit and falls back to the epoch reset time', () => {
  const message = describeRateLimit([
    { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'seven_day', resetsAt: 1_792_000_000 } },
  ])
  assert.match(message, /its weekly session limit/)
  assert.match(message, /resets 2026-10-14T/)
})

test('describeRateLimit treats an allowed rate_limit_info as no limit', () => {
  const allowed = [{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour' } }]
  assert.equal(describeRateLimit(allowed), null)
})
