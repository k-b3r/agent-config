#!/usr/bin/env node
// PR automation for the reusable auto-merge workflow. Run from any directory:
//   pr-automation merge-if-ready <owner/repo> <sha>
// Merges the open PR whose head is <sha> once it is opted in, green and current
// with its base; otherwise reports which condition holds it. Writes a markdown
// table to $GITHUB_STEP_SUMMARY when set, else stdout. Needs `gh` authenticated
// with a token whose merge triggers push workflows (a GitHub App token, not
// GITHUB_TOKEN).
import { execFileSync } from 'node:child_process'
import { appendFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OPT_IN_LABEL = 'automerge'
const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])
const GATE_CHECK = /(^|\/ )gate$/
// The evaluating job's own check run is still in progress while it decides.
const SELF_CHECK = /auto-merge/

export function mergeDecision({ pr, checks, behindBy, sha }) {
  const labels = new Set(pr.labels.map((label) => label.name))
  const others = checks.filter((check) => !SELF_CHECK.test(check.name))
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
  const checks = json(gh(['api', `repos/${repo}/commits/${sha}/check-runs?per_page=100`])).check_runs
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

function main([command, repo, sha]) {
  if (command !== 'merge-if-ready' || !repo || !sha) {
    console.error('usage: pr-automation merge-if-ready <owner/repo> <sha>')
    return 2
  }
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' })
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  const report = (line) => (summaryFile ? appendFileSync(summaryFile, `${line}\n`) : console.log(line))
  mergeIfReady({ repo, sha, gh, report })
  return 0
}

// realpath: package managers expose the bin through a symlink.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
