#!/usr/bin/env node
// Where a repo's GitHub Actions minutes go. Run from the repo, or pass --repo:
//   ci-report [--since <days>d] [--repo owner/name]
// Reads runs and every job attempt via `gh api` (costs no Actions minutes) and
// prints billed minutes per workflow, job and branch, plus re-run counts.
// Billing rounds each job up to a whole minute; skipped jobs bill nothing.
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_SINCE_DAYS = 7
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

export function billedMinutes(job) {
  if (!job.started_at || !job.completed_at || job.conclusion === 'skipped') return 0
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at)
  return Math.max(1, Math.ceil(ms / MS_PER_MINUTE))
}

const add = (totals, key, minutes) => {
  totals[key] = (totals[key] ?? 0) + minutes
}

export function summarize(runs, jobsByRun) {
  const summary = { total: 0, byWorkflow: {}, byJob: {}, byBranch: {} }
  for (const run of runs) {
    const workflow = (summary.byWorkflow[run.name] ??= { minutes: 0, runs: 0, reruns: 0 })
    workflow.runs += 1
    if (run.run_attempt > 1) workflow.reruns += 1
    for (const job of jobsByRun[run.id] ?? []) {
      const minutes = billedMinutes(job)
      if (minutes === 0) continue
      summary.total += minutes
      workflow.minutes += minutes
      add(summary.byJob, job.name, minutes)
      add(summary.byBranch, run.head_branch, minutes)
    }
  }
  return summary
}

const biggestFirst = (entries, minutesOf) => entries.sort((a, b) => minutesOf(b) - minutesOf(a))

export function formatReport(summary, since) {
  const lines = [`GitHub Actions since ${since}: ${summary.total} billed min`, '', 'By workflow:']
  for (const [name, w] of biggestFirst(Object.entries(summary.byWorkflow), ([, w]) => w.minutes)) {
    lines.push(`  ${name.padEnd(28)} ${String(w.minutes).padStart(4)} min  ${w.runs} runs  ${w.reruns} re-runs`)
  }
  for (const [title, totals] of [
    ['By job', summary.byJob],
    ['By branch', summary.byBranch],
  ]) {
    lines.push('', `${title}:`)
    for (const [name, minutes] of biggestFirst(Object.entries(totals), ([, m]) => m)) {
      lines.push(`  ${name.padEnd(40)} ${String(minutes).padStart(4)} min`)
    }
  }
  return lines.join('\n')
}

const jsonLines = (text) =>
  text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

export function collect({ repo, since, gh }) {
  const runs = jsonLines(
    gh(['api', `repos/${repo}/actions/runs?created=>=${since}&per_page=100`, '--paginate', '--jq', '.workflow_runs[]']),
  )
  // filter=all: earlier attempts of a re-run bill too.
  const jobsByRun = Object.fromEntries(
    runs.map((run) => [
      run.id,
      jsonLines(gh(['api', `repos/${repo}/actions/runs/${run.id}/jobs?filter=all&per_page=100`, '--paginate', '--jq', '.jobs[]'])),
    ]),
  )
  return { runs, jobsByRun }
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
    console.error('usage: ci-report [--since <days>d] [--repo owner/name]')
    return 2
  }
  const gh = (ghArgs) => execFileSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const repo = options.repo ?? gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim()
  const since = new Date(Date.now() - options.days * MS_PER_DAY).toISOString().slice(0, 10)
  const { runs, jobsByRun } = collect({ repo, since, gh })
  console.log(formatReport(summarize(runs, jobsByRun), since))
  return 0
}

// realpath: package managers expose the bin through a symlink.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
