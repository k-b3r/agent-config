#!/usr/bin/env node
// Why an agent review run failed when the CI Claude token hit its session limit:
//   review-rate-limit <execution-file>
// Prints one line naming the limit and its reset time when the transcript shows a
// rate limit, and nothing otherwise. Exit 2 when the file can't be read as JSON.
// The limit fails the review in seconds with an error the action's log doesn't explain.
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LIMIT_NAMES = { five_hour: 'five-hour session', seven_day: 'weekly session' }

// Every object in the transcript, depth first.
function* objects(value) {
  if (Array.isArray(value)) {
    for (const item of value) yield* objects(item)
  } else if (value && typeof value === 'object') {
    yield value
    for (const item of Object.values(value)) yield* objects(item)
  }
}

// Returns the one-line explanation for a rate-limited transcript, or null.
// Limited means a rate_limit_info with status "rejected", or an error result that
// says "session limit". A tool result quoting those words is not a limit.
export function describeRateLimit(transcript) {
  let info = null
  let result = null
  for (const node of objects(transcript)) {
    if (node.rate_limit_info?.status === 'rejected') info = info ?? node.rate_limit_info
    if (node.type === 'result' && node.is_error === true && /session limit/i.test(node.result ?? '')) {
      result = result ?? node
    }
  }
  if (!info && !result) return null

  const limit = LIMIT_NAMES[info?.rateLimitType] ?? 'session'
  const reset = resetText(result?.result) ?? resetFromEpoch(info?.resetsAt) ?? 'unknown time'
  return (
    `Agent review rate-limited: the CI Claude token hit its ${limit} limit (resets ${reset}). ` +
    'The gate stays blocked until the review re-runs after the reset. ' +
    'Repo owner: /approve if a human reviewed this PR during the outage.'
  )
}

function resetText(message) {
  const match = /resets\s+(.+?)\s*$/i.exec(message ?? '')
  return match ? match[1] : null
}

// Seconds or milliseconds since the epoch, whichever the transcript carries.
function resetFromEpoch(value) {
  if (typeof value !== 'number') return null
  const ms = value < 1e12 ? value * 1000 : value
  return new Date(ms).toISOString()
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: review-rate-limit <execution-file>')
    process.exit(2)
  }
  let transcript
  try {
    transcript = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(`review-rate-limit: cannot read ${file} as JSON: ${error.message}`)
    process.exit(2)
  }
  const message = describeRateLimit(transcript)
  if (message) console.log(message)
}
