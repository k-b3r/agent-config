#!/usr/bin/env node
// Which model reviews a PR, and whether a failed Claude review reruns on DeepSeek:
//   review-route pick                     env REVIEW_TIER (repo-checks review-tier), HAS_DEEPSEEK_KEY and HAS_CLAUDE_TOKEN ("true" or empty)
//   review-route fallback <execution-file>  decides from the failed Claude transcript; "" when none
// Both print `key=value` lines for $GITHUB_OUTPUT. Policy (owner, 2026-11-17): DeepSeek reviews everything
// the tier does not send to Claude; a Claude review that dies on the session limit or at start-up reruns
// on DeepSeek, silently. A missing DeepSeek key never breaks a PR: it falls back to the old Claude-only run.
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describeRateLimit } from './review-rate-limit.mjs'

const NO_CLAUDE = 'CLAUDE_CODE_OAUTH_TOKEN is not set in the caller: this PR is reviewed by DeepSeek, whatever its tier'
const NO_KEY = 'OPENCODE_API_KEY is not set in the caller: this PR is reviewed by Claude'

// `tier` is repo-checks' answer ('claude' | 'deepseek'); anything else is treated as claude (the stricter reviewer).
// A caller without a Claude token (a solo repo that only has the DeepSeek key) reviews everything on DeepSeek.
export function pickReviewer({ tier, hasDeepseekKey, hasClaudeToken = true }) {
  if (!hasClaudeToken && hasDeepseekKey) return { primary: 'deepseek', canFallback: false, note: NO_CLAUDE }
  if (tier === 'deepseek') {
    return hasDeepseekKey
      ? { primary: 'deepseek', canFallback: false, note: '' }
      : { primary: 'claude', canFallback: false, note: NO_KEY }
  }
  return hasDeepseekKey
    ? { primary: 'claude', canFallback: true, note: '' }
    : { primary: 'claude', canFallback: false, note: 'OPENCODE_API_KEY is not set in the caller: no fallback if Claude fails' }
}

// Every object in the transcript, depth first.
function* objects(value) {
  if (Array.isArray(value)) {
    for (const item of value) yield* objects(item)
  } else if (value && typeof value === 'object') {
    yield value
    for (const item of Object.values(value)) yield* objects(item)
  }
}

const POSTS = /\bgh pr (comment|edit)\b/

// A tool call that already wrote to the PR: a rerun would post the review twice.
function postedToPr(transcript) {
  for (const node of objects(transcript)) {
    if (node.type !== 'tool_use') continue
    if (node.name === 'mcp__github_inline_comment__create_inline_comment') return true
    if (typeof node.input?.command === 'string' && POSTS.test(node.input.command)) return true
  }
  return false
}

// `transcript` is the failed Claude run's execution file (parsed), or null. Only two failures say nothing
// about the PR and cost nothing to retry elsewhere: the session limit, and an error result before any
// tool call that billed nothing (stale token, init error; seen on k-b3r/buy-and-sell run 43828905921:
// 1 turn, 2 s, $0, empty modelUsage). Any other failure keeps failing the job.
export function fallbackDecision(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) return { run: false, reason: 'no transcript to judge' }
  if (postedToPr(transcript)) return { run: false, reason: 'Claude already posted to the PR before it failed' }
  if (describeRateLimit(transcript)) return { run: true, reason: 'Claude session limit' }
  const result = transcript.filter((node) => node?.type === 'result').at(-1)
  const calledTool = [...objects(transcript)].some((node) => node.type === 'tool_use')
  const billed = (result?.total_cost_usd ?? 0) > 0 || Object.keys(result?.modelUsage ?? {}).length > 0
  if (result?.is_error === true && !calledTool && !billed) return { run: true, reason: 'Claude failed at start-up' }
  return { run: false, reason: 'Claude failed for another reason' }
}

function readTranscript(file) {
  if (!file) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2)
  if (command === 'pick') {
    const route = pickReviewer({ tier: process.env.REVIEW_TIER ?? '', hasDeepseekKey: process.env.HAS_DEEPSEEK_KEY === 'true', hasClaudeToken: process.env.HAS_CLAUDE_TOKEN !== 'false' })
    console.log(`primary=${route.primary}\ncan_fallback=${route.canFallback}\nnote=${route.note}`)
  } else if (command === 'fallback') {
    const decision = fallbackDecision(readTranscript(file))
    console.log(`run=${decision.run}\nreason=${decision.reason}`)
  } else {
    console.error('usage: review-route pick | review-route fallback <execution-file>')
    process.exit(2)
  }
}
