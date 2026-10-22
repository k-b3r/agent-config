#!/usr/bin/env node
// PR automation for the reusable auto-merge workflow. Run from any directory:
//   pr-automation merge-if-ready <owner/repo> <sha>
//   pr-automation diff-unchanged <owner/repo> <base> <before-sha> <after-sha> [generated-path...]
//   pr-automation review-covered <owner/repo> <sha>
//   pr-automation review-reusable <owner/repo> <sha> <pr-number>
//   pr-automation workflow-gate <flag|unflag> <owner/repo> <pr-number> <workflow-path>
// Merges the open PR whose head is <sha> once it is opted in, green and current
// with its base; otherwise reports which condition holds it. Writes a markdown
// table to stdout (the run log, readable with `gh run view --log`) and to
// $GITHUB_STEP_SUMMARY when set (web UI only). Needs `gh` authenticated
// with a token whose merge triggers push workflows (a GitHub App token, not
// GITHUB_TOKEN).
// diff-unchanged exits 0 when a push left the PR's own change as it was
// (e.g. pr-upkeep merged the base in cleanly, or only regenerated files under
// the generated paths), so pr-review keeps `human-approved` and skips
// re-reviewing; any other outcome, errors included, exits 1.
// review-covered exits 0 when an agent review covered <sha>'s diff, 1 otherwise;
// pr-review skips a diff-unchanged push only when it does.
// review-reusable exits 0 when that review's verdict may carry over to an
// identical-diff push: covered, and not a blocking one (see reviewReusable).
// workflow-gate flag labels a PR that changes the workflow running the review
// (the review action skips itself then); unflag drops that label once the file
// is out of the diff, but only a label the gate itself added (see workflowGate).
import { execFileSync } from 'node:child_process'
import { appendFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OPT_IN_LABEL = 'automerge'
const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])
const GATE_CHECK = /(^|\/ )gate$/
// The evaluating job's own check run is still in progress while it decides.
const SELF_CHECK = /auto-merge/

// Checks re-run on the same commit (label events skip the gate, a human
// re-runs a failed job): judge each name by its newest run that actually ran,
// falling back to the newest skipped one when it never ran.
function currentRuns(checks) {
  const byName = new Map()
  const rank = (check) => [check.conclusion !== 'skipped', check.started_at ?? '']
  for (const check of checks) {
    const held = byName.get(check.name)
    if (!held) {
      byName.set(check.name, check)
      continue
    }
    const [ranA, atA] = rank(check)
    const [ranB, atB] = rank(held)
    if (ranA > ranB || (ranA === ranB && atA > atB)) byName.set(check.name, check)
  }
  return [...byName.values()]
}

export function mergeDecision({ pr, checks, behindBy, sha }) {
  const labels = new Set(pr.labels.map((label) => label.name))
  const others = currentRuns(checks.filter((check) => !SELF_CHECK.test(check.name)))
  const notGreen = others
    .filter((check) => check.status !== 'completed' || !OK_CONCLUSIONS.has(check.conclusion))
    .map((check) => `${check.name}: ${check.status === 'completed' ? check.conclusion : check.status}`)
  const gate = others.find((check) => GATE_CHECK.test(check.name))
  const conditions = [
    { name: 'open and ready', ok: pr.state === 'OPEN' && !pr.isDraft },
    { name: 'head is the evaluated commit', ok: pr.headRefOid === sha, detail: pr.headRefOid },
    { name: `labelled ${OPT_IN_LABEL}`, ok: labels.has(OPT_IN_LABEL) },
    { name: 'no agent-changes-requested', ok: !labels.has('agent-changes-requested') },
    { name: 'no needs-human, or human-approved', ok: !labels.has('needs-human') || labels.has('human-approved') },
    { name: 'all checks finished green', ok: notGreen.length === 0, detail: notGreen.join(', ') },
    { name: 'gate passed', ok: gate?.conclusion === 'success' },
    { name: `up to date with ${pr.baseRefName}`, ok: behindBy === 0, detail: `${behindBy} behind` },
  ]
  return { merge: conditions.every((condition) => condition.ok), conditions }
}

const json = (text) => JSON.parse(text)

export function mergeIfReady({ repo, sha, gh, report }) {
  const open = json(gh(['api', `repos/${repo}/commits/${sha}/pulls`])).filter((pr) => pr.state === 'open')
  if (open.length === 0) {
    report(`auto-merge: no open PR has ${sha} as a commit, nothing to do`)
    return null
  }
  const number = String(open[0].number)
  const pr = json(
    gh(['pr', 'view', number, '--repo', repo, '--json', 'number,state,isDraft,labels,headRefName,headRefOid,baseRefName']),
  )
  const checks = json(gh(['api', `repos/${repo}/commits/${sha}/check-runs?filter=all&per_page=100`])).check_runs
  const behindBy = json(gh(['api', `repos/${repo}/compare/${pr.baseRefName}...${sha}`])).behind_by
  const decision = mergeDecision({ pr, checks, behindBy, sha })

  report(`### auto-merge: PR #${number} (${pr.headRefName})\n`)
  report('| condition | met | detail |\n|---|---|---|')
  for (const { name, ok, detail } of decision.conditions) report(`| ${name} | ${ok ? 'yes' : 'no'} | ${detail ?? ''} |`)
  if (!decision.merge) {
    report('\nHeld: waiting on the conditions marked no.')
    return decision
  }
  gh(['pr', 'merge', number, '--repo', repo, '--merge', '--subject', `merge ${pr.headRefName}`, '--body', '', '--match-head-commit', sha])
  report(`\nmerged as \`merge ${pr.headRefName}\``)
  return decision
}

// What a human approved is the PR's diff against its base. Blob ids and hunk
// line numbers shift when the base moves under an unchanged change; anything
// else (an edited line, context the base changed) counts as a new change.
// Files under generatedPaths (what pr-upkeep regenerates) are left out: they
// follow from the source a human saw, so regenerating them changes nothing.
function normalizeDiff(diff, generatedPaths) {
  const prefixes = generatedPaths.map((path) => path.replace(/\/*$/, '/'))
  const generated = (file) => prefixes.some((prefix) => file.startsWith(prefix))
  let skipping = false
  const kept = []
  for (const line of diff.split('\n')) {
    const header = line.match(/^diff --git a\/(.*) b\/(.*)$/)
    if (header) skipping = generated(header[1]) && generated(header[2])
    // Empty lines are only the text's trailing newline (blank context is ' ').
    if (skipping || line === '' || line.startsWith('index ')) continue
    kept.push(line.replace(/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/, '@@'))
  }
  return kept.join('\n')
}

export function sameChange(diffBefore, diffAfter, generatedPaths = []) {
  return normalizeDiff(diffBefore, generatedPaths) === normalizeDiff(diffAfter, generatedPaths)
}

export function prDiffUnchanged({ repo, base, before, after, generatedPaths = [], gh }) {
  const diff = (sha) => gh(['api', '-H', 'Accept: application/vnd.github.diff', `repos/${repo}/compare/${base}...${sha}`])
  try {
    return sameChange(diff(before), diff(after), generatedPaths)
  } catch {
    return false
  }
}

// pr-review's last agent-review step, run only when the review covered the
// diff: Claude reviewed it, or a diff-unchanged push inherited a covered
// commit. A green job alone proves nothing: skips succeed too, and before
// this check a skip after a failed review let PRs merge unreviewed
// (k-b3r/buy-and-sell-ai#36..#42, 2026-10-06).
export const REVIEW_COVERED_STEP = 'Mark the diff as reviewed'

export function reviewCovered({ repo, sha, gh }) {
  try {
    const runs = JSON.parse(gh(['api', `repos/${repo}/actions/runs?head_sha=${sha}&event=pull_request&per_page=100`]))
    return runs.workflow_runs.some((run) =>
      JSON.parse(gh(['api', `repos/${repo}/actions/runs/${run.id}/jobs`])).jobs.some(
        (job) =>
          job.name.endsWith('agent-review') &&
          job.steps.some((step) => step.name === REVIEW_COVERED_STEP && step.conclusion === 'success'),
      ),
    )
  } catch {
    return false
  }
}

// Decision rule for a diff-unchanged push (same diff vs base, new head SHA).
// Passing review: reuse it, the reviewer saw this exact change. Blocking review
// (`agent-changes-requested` still set): do not reuse. The blocker may have been
// fixed by something the diff cannot show (commit message, rewritten history),
// and reusing would keep failing the gate on a stale verdict. Re-run the review,
// which sets or removes the label afresh. Unknown labels: re-review.
export function reviewReusable({ repo, sha, pr, gh }) {
  if (!reviewCovered({ repo, sha, gh })) return false
  try {
    const labels = JSON.parse(gh(['api', `repos/${repo}/issues/${pr}/labels`]))
    return !labels.some((label) => label.name === 'agent-changes-requested')
  } catch {
    return false
  }
}

// The review action skips itself on a PR that changes the workflow running it,
// so the gate adds `needs-human` and leaves a comment carrying a hidden marker.
// The newest marker comment says whether the gate's label is standing
// (`flagged`) or was dropped. `unflag` removes `needs-human` only when the
// newest marker is `flagged`, the label is set and the file left the diff; a
// label with no such marker (the review's, or a human's) is never touched.
// Run `unflag` before the review step: the review may then add its own label.
export const WORKFLOW_MARKER = 'gate:needs-human-workflow-changed'

export function workflowGate({ mode, repo, pr, path, gh }) {
  const inDiff = gh(['pr', 'diff', String(pr), '--repo', repo, '--name-only']).split('\n').includes(path)
  const states = gh([
    'api', '--paginate', `repos/${repo}/issues/${pr}/comments`,
    '--jq', `.[] | .body | capture("<!-- ${WORKFLOW_MARKER}:(?<s>[a-z]+) -->")? | .s`,
  ]).split('\n').filter(Boolean)
  const flagged = states.at(-1) === 'flagged'
  const comment = (state, text) =>
    gh(['pr', 'comment', String(pr), '--repo', repo, '--body', `<!-- ${WORKFLOW_MARKER}:${state} -->\n${text}`])
  if (mode === 'flag' && inDiff) {
    gh(['pr', 'edit', String(pr), '--repo', repo, '--add-label', 'needs-human'])
    if (!flagged) {
      comment('flagged', `Agent review skipped: this PR changes \`${path}\`, and the review action only runs a workflow identical to the default branch's. A human reviews this one.`)
    }
    return 'flagged'
  }
  if (mode === 'unflag' && !inDiff && flagged) {
    const labels = JSON.parse(gh(['api', `repos/${repo}/issues/${pr}/labels`]))
    if (!labels.some((label) => label.name === 'needs-human')) return 'none'
    gh(['pr', 'edit', String(pr), '--repo', repo, '--remove-label', 'needs-human'])
    comment('dropped', `This PR no longer changes \`${path}\`: removed the \`needs-human\` the gate added for it. The review runs again.`)
    return 'dropped'
  }
  return 'none'
}

const USAGE = [
  'usage: pr-automation merge-if-ready <owner/repo> <sha>',
  '       pr-automation diff-unchanged <owner/repo> <base> <before-sha> <after-sha> [generated-path...]',
  '       pr-automation review-covered <owner/repo> <sha>',
  '       pr-automation review-reusable <owner/repo> <sha> <pr-number>',
  '       pr-automation workflow-gate <flag|unflag> <owner/repo> <pr-number> <workflow-path>',
].join('\n')

function main([command, repo, ...rest]) {
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' })
  if (command === 'workflow-gate' && rest.length === 3 && ['flag', 'unflag'].includes(repo)) {
    const [target, pr, path] = rest
    console.log(workflowGate({ mode: repo, repo: target, pr, path, gh }))
    return 0
  }
  if (command === 'diff-unchanged' && repo && rest.length >= 3) {
    const [base, before, after, ...generatedPaths] = rest
    return prDiffUnchanged({ repo, base, before, after, generatedPaths, gh }) ? 0 : 1
  }
  if (command === 'review-covered' && repo && rest.length === 1) {
    return reviewCovered({ repo, sha: rest[0], gh }) ? 0 : 1
  }
  if (command === 'review-reusable' && repo && rest.length === 2) {
    return reviewReusable({ repo, sha: rest[0], pr: rest[1], gh }) ? 0 : 1
  }
  const [sha] = rest
  if (command !== 'merge-if-ready' || !repo || !sha) {
    console.error(USAGE)
    return 2
  }
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  const report = (line) => {
    console.log(line)
    if (summaryFile) appendFileSync(summaryFile, `${line}\n`)
  }
  mergeIfReady({ repo, sha, gh, report })
  return 0
}

// realpath: package managers expose the bin through a symlink.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
