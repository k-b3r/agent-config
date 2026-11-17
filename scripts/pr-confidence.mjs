#!/usr/bin/env node
// A confidence label for a PR, computed from evidence the pipeline already has, never from the
// model's own rating of itself. The label gates auto-merge: pr-automation merges an `automerge` PR only at confidence-high.
// High is earned by proof: the agent review must judge the PR's proof sufficient for the CURRENT head commit
// (its `proof: sufficient sha=<head>` line, see proofVerdict), else the tier is capped at medium.
// A critical PR that only the DeepSeek fallback reviewed (marker line `reviewer: deepseek-fallback sha=<head>`,
// posted by pr-review.yml, see reviewerVerdict) is capped at medium too.
//   pr-confidence label <owner/repo> <pr-number>        set exactly one confidence-* label, print the factors
//   pr-confidence label-sha <owner/repo> <sha>           the same for the open PR whose head is <sha> (none: exit 0)
//   pr-confidence pending <owner/repo> <pr-number>       a push landed: drop the old tier, say it is being re-scored
//   pr-confidence calibrate <owner/repo> [--limit <n>]   score recent merged PRs, compare tiers with reverts
//   pr-confidence carry-proof <owner/repo> <pr> <from-sha> <to-sha>   a push left the diff unchanged: repeat the proof verdict for the new head
//   pr-confidence mark-fallback <owner/repo> <pr> <sha>   the DeepSeek fallback reviewed <sha>: post the marker once
// Factors and weights are in FACTORS below: each one names the fact it read, so the score can be argued with.
// Besides the label, one comment (found by its marker, edited in place) carries the factor table.
import { execFileSync } from 'node:child_process'
import { appendFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { currentRuns, reviewCovered } from './pr-automation.mjs'

export const TIER_LABELS = {
  pending: ['confidence-pending', 'BFBFBF', 'A push landed: the evidence is being re-scored'],
  high: ['confidence-high', '0E8A16', 'Proven: checks green, reviewed, proof judged sufficient, tested, small. Auto-merge allowed'],
  medium: ['confidence-medium', 'FBCA04', 'Proof or evidence is missing or a risk is open: a human decides (read the factors)'],
  low: ['confidence-low', 'D93F0B', 'A check fails, a blocker is open, or the evidence is thin'],
}
const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])
// Not evidence about the change: the jobs that decide, label and merge.
const OWN_CHECK = /(^|\/ )(gate|confidence)$|auto-merge/
const TEST_PATH = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.([cm]?[jt]sx?|sh)$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$/
const NON_CODE_PATH = /\.(md|mdx|txt|json|ya?ml|toml)$|^docs\/|^\.github\/|(^|\/)(LICENSE|\.gitignore)$/
const WORKFLOW_PATH = /^\.github\/workflows\//
const MAX_REVIEWED_COMMITS = 3 // beyond this the author and the reviewer are circling (article: cap at 3 rounds)

// Hard factors force the low tier; a cap factor limits the tier to its `cap`; the rest subtract points from 100.
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
  // A trivial change can just say so under the heading ("None: docs only"); a missing section says nothing.
  ({ risksSection }) =>
    risksSection === false
      ? { name: 'risk section', points: -10, detail: 'the PR body has no "## Risks" section: say "none" there if the change carries no risk' }
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
  // The authoring agent earns high by showing its work: the review judges each claim in the PR.
  ({ proof }) =>
    proof?.status === 'sufficient'
      ? null
      : {
          name: 'proof',
          points: 0,
          cap: 'medium',
          detail: !proof
            ? 'no agent review verdict "proof: sufficient" for the current head commit: capped at medium'
            : `the review judged the proof insufficient: capped at medium. Unproven: ${proof.claims.join('; ') || 'see the review summary'}`,
        },
  ({ reviewer }) =>
    reviewer === FALLBACK_REVIEWER
      ? { name: 'reviewer', points: 0, cap: 'medium', detail: 'critical PR reviewed by the fallback model: capped at medium, a human decides' }
      : null,
  ({ verified }) =>
    verified === 'missing' || verified === 'empty'
      ? { name: 'verified section', points: -20, detail: 'the PR body has no filled "## Verified" section: paste proof per claim (test names, command output, screenshot), or say "docs only" / "config only"' }
      : null,
  ({ verified, files }) =>
    verified === 'text' && files.some((f) => !NON_CODE_PATH.test(f))
      ? { name: 'verified output', points: -10, detail: 'code changed but "## Verified" has no fenced output block or screenshot' }
      : null,
  ({ files }) =>
    files.some((f) => WORKFLOW_PATH.test(f)) ? { name: 'workflow files', points: -15, detail: 'CI is part of this change' } : null,
]

export function scoreEvidence(evidence) {
  const factors = FACTORS.map((factor) => factor(evidence)).filter(Boolean)
  const score = Math.max(0, 100 + factors.reduce((sum, f) => sum + f.points, 0))
  const hard = factors.some((f) => f.hard)
  const capped = factors.some((f) => f.cap === 'medium')
  const tier = hard || score < 50 ? 'low' : score >= 80 && !capped ? 'high' : 'medium'
  return { score, tier, factors }
}

// Facts only: nothing here asks a model what it thinks.
export function collectEvidence({ repo, pr, gh }) {
  const view = JSON.parse(
    gh(['pr', 'view', String(pr), '--repo', repo, '--json', 'additions,deletions,files,labels,body,headRefOid,headRefName']),
  )
  const runs = JSON.parse(gh(['api', `repos/${repo}/commits/${view.headRefOid}/check-runs?per_page=100`])).check_runs
  // A check re-run on the same head leaves its old runs behind: judge each name by its latest real run.
  const others = currentRuns(runs.filter((run) => !OWN_CHECK.test(run.name)))
  const failing = others.filter((r) => r.status === 'completed' && !OK_CONCLUSIONS.has(r.conclusion)).map((r) => r.name)
  const pending = others.filter((r) => r.status !== 'completed').map((r) => r.name)
  const shas = reviewedShas({ repo, branch: view.headRefName, gh })
  return {
    checks: { failing, pending },
    labels: view.labels.map((label) => label.name),
    reviewed: reviewCovered({ repo, sha: view.headRefOid, gh }),
    reviewedCommits: shas.filter((sha) => reviewCovered({ repo, sha, gh })).length,
    proof: proofVerdict({ repo, pr, sha: view.headRefOid, gh }),
    reviewer: reviewerVerdict({ repo, pr, sha: view.headRefOid, gh }),
    verified: verifiedState(view.body),
    risks: tickedRisks(view.body),
    risksSection: hasRisksSection(view.body),
    linesChanged: view.additions + view.deletions,
    files: view.files.map((file) => file.path),
  }
}

// Only the boxes under the template's "## Risks" heading: a PR body may carry other checklists.
const risksSectionOf = (body) => (body ?? '').split(/^## /m).find((part) => /^Risks\b/i.test(part))

export const hasRisksSection = (body) => risksSectionOf(body) !== undefined

export function tickedRisks(body) {
  const section = risksSectionOf(body) ?? ''
  return [...section.matchAll(/^- \[[xX]\] (.+)$/gm)].map((m) => m[1].trim())
}

// The proof section of the PR body: 'missing' (no section), 'empty' (nothing, "not run", or the template's
// guidance left in), 'text' (words only), 'output' (a non-empty fenced block or an image).
export function verifiedState(body) {
  const part = (body ?? '').split(/^## /m).find((p) => /^Verified\b/i.test(p))
  if (part === undefined) return 'missing'
  const text = part.replace(/^Verified[^\n]*\n/i, '').replace(/<!--[\s\S]*?-->/g, '').trim()
  const placeholder = /^(not run|n\/a|none|tbd|todo|-)\.?$/i
  const guidance = /^(Proof per claim|Commands run and their actual output)/i
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length || lines.every((l) => placeholder.test(l)) || guidance.test(text)) return 'empty'
  return /```[^\n]*\n\s*\S[\s\S]*?```|!\[[^\]]*\]\(/.test(text) ? 'output' : 'text'
}

// The review's proof verdict for exactly this commit, or null (none, or only for an older commit: a verdict
// does not carry across pushes). The reviewer ends its summary comment with `proof: sufficient sha=<head>` or
// `proof: insufficient sha=<head>` plus one `- claim` line per unproven claim. Only comments by a bot count,
// so the PR's author cannot write its own verdict; the newest matching comment wins.
const PROOF_LINE = /^proof: (sufficient|insufficient) sha=([0-9a-f]{7,40})[ \t]*$/im

export function parseProof(body) {
  const lines = (body ?? '').split('\n')
  const at = lines.findIndex((l) => PROOF_LINE.test(l))
  if (at === -1) return null
  const [, status, sha] = lines[at].match(PROOF_LINE)
  const claims = []
  for (const line of lines.slice(at + 1)) {
    const m = line.match(/^\s*[-*] (.+)$/)
    if (!m) break
    claims.push(m[1].trim())
  }
  return { status: status.toLowerCase(), sha: sha.toLowerCase(), claims }
}

// Bodies of the comments a bot wrote on the PR, or null when gh fails (a missing verdict, never a crash).
function botComments({ repo, pr, gh }) {
  try {
    return gh(['api', '--paginate', `repos/${repo}/issues/${pr}/comments`, '--jq', '.[] | select(.user.type == "Bot") | .body | @json'])
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return null
  }
}

const sameCommit = (a, b) => a.startsWith(b) || b.startsWith(a)

export function proofVerdict({ repo, pr, sha, gh }) {
  const head = sha.toLowerCase()
  const verdicts = (botComments({ repo, pr, gh }) ?? []).map(parseProof).filter((v) => v && sameCommit(head, v.sha))
  const found = verdicts.at(-1)
  return found ? { status: found.status, claims: found.claims } : null
}

// The reviewer marker: `reviewer: deepseek-fallback sha=<head>`. pr-review.yml posts it as a separate bot comment
// when Claude failed (session limit or start-up) on a claude-tier PR and DeepSeek reviewed it instead; the
// model never writes it, so a model that forgets cannot hide the fallback.
export const FALLBACK_REVIEWER = 'deepseek-fallback'
const REVIEWER_LINE = /^reviewer: ([a-z-]+) sha=([0-9a-f]{7,40})[ \t]*$/im

export function parseReviewer(body) {
  const match = (body ?? '').split('\n').map((line) => line.match(REVIEWER_LINE)).find(Boolean)
  return match ? { reviewer: match[1].toLowerCase(), sha: match[2].toLowerCase() } : null
}

// The fallback marker for exactly this commit, or null. A marker for an older commit does not apply: a new push is
// reviewed afresh, by Claude when it can.
export function reviewerVerdict({ repo, pr, sha, gh }) {
  const head = sha.toLowerCase()
  const found = (botComments({ repo, pr, gh }) ?? []).map(parseReviewer).find((m) => m?.reviewer === FALLBACK_REVIEWER && sameCommit(head, m.sha))
  return found ? FALLBACK_REVIEWER : null
}

// Idempotent: a re-run of the review job on the same head posts nothing new.
export function markReviewer({ repo, pr, sha, gh }) {
  if (reviewerVerdict({ repo, pr, sha, gh })) return false
  gh(['api', `repos/${repo}/issues/${pr}/comments`, '-f', `body=reviewer: ${FALLBACK_REVIEWER} sha=${sha}`])
  return true
}

// A push that leaves the PR diff unchanged skips the re-review; the verdict of the reviewed commit still
// holds, so repeat it for the new head. Idempotent: nothing is posted when the new head already has one.
export function carryProof({ repo, pr, from, to, gh }) {
  const verdict = proofVerdict({ repo, pr, sha: from, gh })
  if (!verdict || proofVerdict({ repo, pr, sha: to, gh })) return false
  const marker = reviewerVerdict({ repo, pr, sha: from, gh }) ? [`reviewer: ${FALLBACK_REVIEWER} sha=${to}`, ''] : []
  const body = [`proof: ${verdict.status} sha=${to}`, ...verdict.claims.map((c) => `- ${c}`), '', ...marker, `_Carried over from ${from.slice(0, 7)}: this push left the PR diff unchanged._`].join('\n')
  gh(['api', `repos/${repo}/issues/${pr}/comments`, '-f', `body=${body}`])
  return true
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

export const COMMENT_MARKER = '<!-- pr-confidence'

// The previous run's verdict rides in the marker, so the comment can say what changed.
export function parseMarker(body) {
  const m = (body ?? '').match(/^<!-- pr-confidence tier=(\w+) score=(\d+)(?: was=(\w+):(\d+))? -->/)
  if (!m) return null
  return { tier: m[1], score: Number(m[2]), ...(m[3] ? { was: { tier: m[3], score: Number(m[4]) } } : {}) }
}

// What the PR showed before the last push: a pending marker passes the earlier verdict along.
const lastVerdict = (previous) => (previous?.tier === 'pending' ? previous.was ?? null : previous)

const NOT_A_PROBABILITY = '_Not a probability: this counts the evidence on the PR, and changes after each finished workflow. It gates auto-merge: only confidence-high merges._'

export function renderComment({ result, previous }) {
  const before = lastVerdict(previous)
  const changed = before && (before.tier !== result.tier || before.score !== result.score)
  const lines = [
    `${COMMENT_MARKER} tier=${result.tier} score=${result.score} -->`,
    `### Confidence: ${result.tier} (${result.score}/100)`,
    '',
    NOT_A_PROBABILITY,
    '',
    ...(changed ? [`Was ${before.tier} (${before.score}) before the last update.`, ''] : []),
    '| factor | points | evidence |',
    '|---|---|---|',
    ...(result.factors.length ? result.factors.map((f) => `| ${f.name} | ${f.points} | ${f.detail} |`) : ['| none | 0 | no penalty |']),
  ]
  return lines.join('\n')
}

export function renderPending(previous) {
  const before = lastVerdict(previous)
  return [
    `${COMMENT_MARKER} tier=pending score=0${before ? ` was=${before.tier}:${before.score}` : ''} -->`,
    '### Confidence: pending',
    '',
    NOT_A_PROBABILITY,
    '',
    `A push landed${before ? ` (it was ${before.tier}, ${before.score})` : ''}: the evidence is being re-scored when the checks finish.`,
  ].join('\n')
}

// One comment per PR, found by its marker and edited in place; nothing is written when it would not change.
export function upsertComment({ repo, pr, body, gh }) {
  const found = gh(['api', '--paginate', `repos/${repo}/issues/${pr}/comments`, '--jq', `.[] | select(.body | startswith("${COMMENT_MARKER}")) | {id, body}`])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))[0]
  if (!found) {
    gh(['api', `repos/${repo}/issues/${pr}/comments`, '-f', `body=${body}`])
    return { action: 'created', previous: null }
  }
  const previous = parseMarker(found.body)
  if (found.body === body) return { action: 'unchanged', previous }
  gh(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${found.id}`, '-f', `body=${body}`])
  return { action: 'updated', previous }
}

export function previousVerdict({ repo, pr, gh }) {
  const line = gh(['api', '--paginate', `repos/${repo}/issues/${pr}/comments`, '--jq', `.[] | select(.body | startswith("${COMMENT_MARKER}")) | .body`]).split('\n')[0]
  return parseMarker(line)
}

export function markPending({ repo, pr, gh }) {
  const previous = previousVerdict({ repo, pr, gh })
  setTierLabel({ repo, pr, tier: 'pending', gh })
  upsertComment({ repo, pr, body: renderPending(previous), gh })
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
  '       pr-confidence pending <owner/repo> <pr-number>',
  '       pr-confidence calibrate <owner/repo> [--limit <n>]',
  '       pr-confidence carry-proof <owner/repo> <pr-number> <from-sha> <to-sha>',
  '       pr-confidence mark-fallback <owner/repo> <pr-number> <sha>',
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
    const previous = previousVerdict({ repo, pr, gh })
    const comment = upsertComment({ repo, pr, body: renderComment({ result, previous }), gh })
    const report = renderFactors(result)
    console.log(`${report}\n\n${changed ? 'label updated' : 'label already current'}, comment ${comment.action}`)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`)
    return 0
  }
  if (command === 'carry-proof' && repo && rest.length === 3) {
    const [pr, from, to] = rest
    console.log(carryProof({ repo, pr, from, to, gh }) ? `proof verdict carried to ${to}` : 'no proof verdict to carry')
    return 0
  }
  if (command === 'mark-fallback' && repo && rest.length === 2) {
    const [pr, sha] = rest
    console.log(markReviewer({ repo, pr, sha, gh }) ? `fallback marker posted for ${sha}` : `fallback marker already present for ${sha}`)
    return 0
  }
  if (command === 'pending' && repo && rest.length === 1) {
    markPending({ repo, pr: rest[0], gh })
    console.log(`confidence marked pending on #${rest[0]}`)
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
