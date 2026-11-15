#!/usr/bin/env node
// A confidence label for a PR, computed from evidence the pipeline already has, never from the
// model's own rating of itself. Label only: it informs the human, it gates nothing.
//   pr-confidence label <owner/repo> <pr-number>        set exactly one confidence-* label, print the factors
//   pr-confidence label-sha <owner/repo> <sha>           the same for the open PR whose head is <sha> (none: exit 0)
//   pr-confidence calibrate <owner/repo> [--limit <n>]   score recent merged PRs, compare tiers with reverts
// Factors and weights are in FACTORS below: each one names the fact it read, so the score can be argued with.
import { execFileSync } from 'node:child_process'
import { appendFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { reviewCovered } from './pr-automation.mjs'

export const TIER_LABELS = {
  high: ['confidence-high', '0E8A16', 'Evidence supports merging: checks green, reviewed, tested, small'],
  medium: ['confidence-medium', 'FBCA04', 'Some evidence is missing or a risk is open: read the factors'],
  low: ['confidence-low', 'D93F0B', 'A check fails, a blocker is open, or the evidence is thin'],
}
const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])
// Not evidence about the change: the jobs that decide, label and merge.
const OWN_CHECK = /(^|\/ )(gate|confidence)$|auto-merge/
const TEST_PATH = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/
const NON_CODE_PATH = /\.(md|mdx|txt|json|ya?ml|toml)$|^docs\/|^\.github\/|(^|\/)(LICENSE|\.gitignore)$/
const WORKFLOW_PATH = /^\.github\/workflows\//
const MAX_REVIEWED_COMMITS = 3 // beyond this the author and the reviewer are circling (article: cap at 3 rounds)

// Hard factors force the low tier; the rest subtract points from 100.
const FACTORS = [
  ({ checks }) =>
    checks.failing.length
      ? { name: 'checks', points: -100, hard: true, detail: `failing: ${checks.failing.join(', ')}` }
      : null,
  ({ labels }) =>
    labels.includes('agent-changes-requested')
      ? { name: 'blocking review', points: -100, hard: true, detail: 'agent-changes-requested is set' }
      : null,
  ({ checks }) =>
    checks.pending.length
      ? { name: 'checks running', points: -10, detail: `${checks.pending.length} still running, the label is refreshed when they finish` }
      : null,
  ({ reviewed }) => (reviewed ? null : { name: 'review coverage', points: -40, detail: 'no agent review covers the final commit' }),
  ({ reviewedCommits }) =>
    reviewedCommits > MAX_REVIEWED_COMMITS
      ? { name: 'review rounds', points: -20, detail: `${reviewedCommits} commits reviewed (cap ${MAX_REVIEWED_COMMITS}): reconsider the approach` }
      : null,
  ({ labels }) =>
    labels.includes('needs-human') && !labels.includes('human-approved')
      ? { name: 'open decision', points: -25, detail: 'needs-human without human-approved' }
      : null,
  ({ risks }) =>
    risks.length
      ? { name: 'risk boxes', points: -Math.min(40, 20 * risks.length), detail: risks.join('; ') }
      : null,
  ({ linesChanged }) =>
    linesChanged > 1000
      ? { name: 'size', points: -25, detail: `${linesChanged} lines changed` }
      : linesChanged > 400
        ? { name: 'size', points: -10, detail: `${linesChanged} lines changed` }
        : null,
  ({ files }) => {
    const code = files.filter((f) => !NON_CODE_PATH.test(f) && !TEST_PATH.test(f))
    return code.length && !files.some((f) => TEST_PATH.test(f))
      ? { name: 'tests', points: -20, detail: `${code.length} code file(s) changed, no test file` }
      : null
  },
  ({ files }) =>
    files.some((f) => WORKFLOW_PATH.test(f)) ? { name: 'workflow files', points: -15, detail: 'CI is part of this change' } : null,
]

export function scoreEvidence(evidence) {
  const factors = FACTORS.map((factor) => factor(evidence)).filter(Boolean)
  const score = Math.max(0, 100 + factors.reduce((sum, f) => sum + f.points, 0))
  const hard = factors.some((f) => f.hard)
  const tier = hard || score < 50 ? 'low' : score >= 80 ? 'high' : 'medium'
  return { score, tier, factors }
}

// Facts only: nothing here asks a model what it thinks.
export function collectEvidence({ repo, pr, gh }) {
  const view = JSON.parse(
    gh(['pr', 'view', String(pr), '--repo', repo, '--json', 'additions,deletions,files,labels,body,headRefOid,headRefName']),
  )
  const runs = JSON.parse(gh(['api', `repos/${repo}/commits/${view.headRefOid}/check-runs?per_page=100`])).check_runs
  const others = runs.filter((run) => !OWN_CHECK.test(run.name))
  const failing = others.filter((r) => r.status === 'completed' && !OK_CONCLUSIONS.has(r.conclusion)).map((r) => r.name)
  const pending = others.filter((r) => r.status !== 'completed').map((r) => r.name)
  const shas = reviewedShas({ repo, branch: view.headRefName, gh })
  return {
    checks: { failing, pending },
    labels: view.labels.map((label) => label.name),
    reviewed: reviewCovered({ repo, sha: view.headRefOid, gh }),
    reviewedCommits: shas.filter((sha) => reviewCovered({ repo, sha, gh })).length,
    risks: [...(view.body ?? '').matchAll(/^- \[[xX]\] (.+)$/gm)].map((m) => m[1].trim()),
    linesChanged: view.additions + view.deletions,
    files: view.files.map((file) => file.path),
  }
}

// Distinct commits of the branch that had a pr-review run; reviewCovered says which were really reviewed.
function reviewedShas({ repo, branch, gh }) {
  try {
    const runs = JSON.parse(gh(['api', `repos/${repo}/actions/runs?event=pull_request&branch=${encodeURIComponent(branch)}&per_page=100`]))
    return [...new Set(runs.workflow_runs.filter((run) => run.name === 'pr-review').map((run) => run.head_sha))]
  } catch {
    return []
  }
}

// The open PR whose head is this commit, or null (a push to main, a fork, a closed PR).
export function openPrForSha({ repo, sha, gh }) {
  const prs = JSON.parse(gh(['api', `repos/${repo}/commits/${sha}/pulls`]))
  return prs.find((pr) => pr.state === 'open' && pr.head.sha === sha)?.number ?? null
}

export function setTierLabel({ repo, pr, tier, gh }) {
  const wanted = TIER_LABELS[tier][0]
  const current = JSON.parse(gh(['api', `repos/${repo}/issues/${pr}/labels`])).map((label) => label.name)
  const stale = Object.values(TIER_LABELS).map(([name]) => name).filter((name) => name !== wanted && current.includes(name))
  if (current.includes(wanted) && !stale.length) return false
  const [name, color, description] = TIER_LABELS[tier]
  gh(['label', 'create', name, '--repo', repo, '--color', color, '--description', description, '--force'])
  gh(['pr', 'edit', String(pr), '--repo', repo, '--add-label', wanted, ...stale.flatMap((s) => ['--remove-label', s])])
  return true
}

export function renderFactors({ score, tier, factors }) {
  const rows = factors.length ? factors.map((f) => `| ${f.name} | ${f.points} | ${f.detail} |`) : ['| none | 0 | no penalty |']
  return [`### Confidence: ${tier} (${score}/100)`, '', '| factor | points | evidence |', '|---|---|---|', ...rows].join('\n')
}

// Tiers against what happened next. Reverts only: a fix-forward leaves no clean trace in git.
export function revertedPrs({ merged, commitSubjects }) {
  const reverted = new Set()
  for (const pr of merged) {
    for (const m of (pr.body ?? '').matchAll(/Reverts [\w./-]*#(\d+)/g)) reverted.add(Number(m[1]))
  }
  const byTitle = new Map(merged.map((pr) => [pr.title, pr.number]))
  for (const subject of commitSubjects) {
    const m = subject.match(/^Revert "(.+)"$/)
    if (m && byTitle.has(m[1])) reverted.add(byTitle.get(m[1]))
  }
  return reverted
}

export function calibrationTable(rows) {
  const out = ['| tier | PRs | reverted |', '|---|---|---|']
  for (const tier of ['high', 'medium', 'low']) {
    const own = rows.filter((row) => row.tier === tier)
    out.push(`| ${tier} | ${own.length} | ${own.filter((row) => row.reverted).length} |`)
  }
  return out.join('\n')
}

const USAGE = [
  'usage: pr-confidence label <owner/repo> <pr-number>',
  '       pr-confidence label-sha <owner/repo> <sha>',
  '       pr-confidence calibrate <owner/repo> [--limit <n>]',
].join('\n')

function main([command, repo, ...rest]) {
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' })
  if ((command === 'label' || command === 'label-sha') && repo && rest.length === 1) {
    const pr = command === 'label' ? rest[0] : openPrForSha({ repo, sha: rest[0], gh })
    if (pr === null) {
      console.log(`no open PR has head ${rest[0]}: nothing to label`)
      return 0
    }
    const evidence = collectEvidence({ repo, pr, gh })
    const result = scoreEvidence(evidence)
    const changed = setTierLabel({ repo, pr, tier: result.tier, gh })
    const report = renderFactors(result)
    console.log(`${report}\n\n${changed ? 'label updated' : 'label already current'}`)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`)
    return 0
  }
  if (command === 'calibrate' && repo) {
    const limit = rest[0] === '--limit' ? Number(rest[1]) : 30
    const merged = JSON.parse(gh(['pr', 'list', '--repo', repo, '--state', 'merged', '--limit', '200', '--json', 'number,title,body']))
    let subjects = []
    try {
      subjects = execFileSync('git', ['log', '--format=%s'], { encoding: 'utf8' }).split('\n')
    } catch {
      console.error('not in a git checkout: reverts made by git revert are not seen')
    }
    const reverted = revertedPrs({ merged, commitSubjects: subjects })
    const rows = merged.slice(0, limit).map((pr) => {
      const result = scoreEvidence(collectEvidence({ repo, pr: pr.number, gh }))
      return { number: pr.number, tier: result.tier, score: result.score, reverted: reverted.has(pr.number) }
    })
    console.log(calibrationTable(rows))
    console.log(`\n${rows.length} merged PRs scored from their final state; ${reverted.size} reverts found in ${merged.length} merged PRs and the git log.`)
    for (const row of rows.filter((r) => r.reverted)) console.log(`reverted: #${row.number} scored ${row.tier} (${row.score})`)
    return 0
  }
  console.error(USAGE)
  return 2
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
