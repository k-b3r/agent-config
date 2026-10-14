#!/usr/bin/env node
// How the agent review's verdicts held up on real PRs. Run from the repo, or pass --repo:
//   review-outcomes [--since <days>d] [--repo owner/name]
// Reads label events of merged PRs via `gh api` and classifies each by what happened
// to the review's labels. `fixed` means the author addressed a blocking finding (the
// agent removed `agent-changes-requested` on a later push); `approved-past` means a
// human signed off on a PR the review had flagged. Together they give a live precision
// proxy: fixed / (fixed + approved-past). The seed suite only measures what we seeded.
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_SINCE_DAYS = 30
const MS_PER_DAY = 86_400_000
const BLOCK_LABEL = 'agent-changes-requested'
const HUMAN_LABEL = 'needs-human'
const APPROVED_LABEL = 'human-approved'

const OUTCOMES = ['clean', 'fixed', 'approved-past', 'flagged-other']

// events: the PR's issue events, oldest first. approved-past wins over fixed: the human
// call is the stronger signal that a flag was not decisive.
export function classify(events) {
  const labelEvents = events.filter((e) => e.event === 'labeled' || e.event === 'unlabeled')
  const added = (name) => labelEvents.some((e) => e.event === 'labeled' && e.label?.name === name)
  const lastAction = (name) => labelEvents.filter((e) => e.label?.name === name).at(-1)?.event
  if (added(APPROVED_LABEL)) return 'approved-past'
  if (added(BLOCK_LABEL) && lastAction(BLOCK_LABEL) === 'unlabeled') return 'fixed'
  if (added(BLOCK_LABEL) || added(HUMAN_LABEL)) return 'flagged-other'
  return 'clean'
}

export function summarize(eventsByPr) {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]))
  const prs = {}
  for (const [number, events] of Object.entries(eventsByPr)) {
    const outcome = classify(events)
    counts[outcome] += 1
    prs[number] = outcome
  }
  const decided = counts.fixed + counts['approved-past']
  return { counts, prs, precision: decided === 0 ? null : counts.fixed / decided }
}

export function formatReport(summary, since) {
  const total = Object.values(summary.counts).reduce((a, b) => a + b, 0)
  const lines = [`Agent review outcomes, PRs merged since ${since}: ${total}`, '']
  for (const outcome of OUTCOMES) lines.push(`  ${outcome.padEnd(14)} ${String(summary.counts[outcome]).padStart(4)}`)
  lines.push('')
  lines.push(
    summary.precision === null
      ? 'Precision proxy: n/a (no PR was fixed or approved past)'
      : `Precision proxy: ${(summary.precision * 100).toFixed(0)}% (fixed / (fixed + approved-past))`,
  )
  for (const outcome of ['approved-past', 'flagged-other']) {
    const numbers = Object.entries(summary.prs)
      .filter(([, o]) => o === outcome)
      .map(([n]) => `#${n}`)
    if (numbers.length > 0) lines.push(`${outcome}: ${numbers.join(' ')}`)
  }
  return lines.join('\n')
}

const jsonLines = (text) =>
  text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

export function collect({ repo, since, gh }) {
  const merged = jsonLines(
    gh(['api', `repos/${repo}/pulls?state=closed&per_page=100`, '--paginate', '--jq', '.[] | select(.merged_at != null) | {number, merged_at}']),
  ).filter((pr) => pr.merged_at.slice(0, 10) >= since)
  return Object.fromEntries(
    merged.map((pr) => [
      pr.number,
      jsonLines(gh(['api', `repos/${repo}/issues/${pr.number}/events?per_page=100`, '--paginate', '--jq', '.[]'])),
    ]),
  )
}

function parseArgs(args) {
  const options = { days: DEFAULT_SINCE_DAYS, repo: null }
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--since' && /^\d+d$/.test(args[i + 1] ?? '')) options.days = Number(args[i + 1].slice(0, -1))
    else if (args[i] === '--repo' && args[i + 1]) options.repo = args[i + 1]
    else return null
  }
  return options
}

function main(args) {
  const options = parseArgs(args)
  if (!options) {
    console.error('usage: review-outcomes [--since <days>d] [--repo owner/name]')
    return 2
  }
  const gh = (ghArgs) => execFileSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const repo = options.repo ?? gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim()
  const since = new Date(Date.now() - options.days * MS_PER_DAY).toISOString().slice(0, 10)
  console.log(formatReport(summarize(collect({ repo, since, gh })), since))
  return 0
}

// realpath: package managers expose the bin through a symlink.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
