import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeDecision, mergeIfReady } from './pr-automation.mjs'

const SHA = 'abc123'
const greenPr = {
  number: 7,
  state: 'OPEN',
  isDraft: false,
  labels: [{ name: 'automerge' }],
  headRefName: 'buy-30-lint',
  headRefOid: SHA,
  baseRefName: 'main',
}
const greenChecks = [
  { name: 'ci / static checks', status: 'completed', conclusion: 'success' },
  { name: 'integration / integration tests', status: 'completed', conclusion: 'skipped' },
  { name: 'review / gate', status: 'completed', conclusion: 'success' },
  { name: 'merge / auto-merge evaluate', status: 'in_progress', conclusion: null },
]
const ready = { pr: greenPr, checks: greenChecks, behindBy: 0, sha: SHA }
const failed = (decision) => decision.conditions.filter((c) => !c.ok).map((c) => c.name)

test('mergeDecision merges a labelled, green, up-to-date PR and ignores its own in-progress check', () => {
  const decision = mergeDecision(ready)
  assert.equal(decision.merge, true)
  assert.deepEqual(failed(decision), [])
})

test('mergeDecision holds a PR without the automerge label', () => {
  const decision = mergeDecision({ ...ready, pr: { ...greenPr, labels: [] } })
  assert.equal(decision.merge, false)
  assert.deepEqual(failed(decision), ['labelled automerge'])
})

test('mergeDecision holds a draft and a PR whose head moved past the evaluated commit', () => {
  assert.deepEqual(failed(mergeDecision({ ...ready, pr: { ...greenPr, isDraft: true } })), ['open and ready'])
  assert.deepEqual(failed(mergeDecision({ ...ready, sha: 'older' })), ['head is the evaluated commit'])
})

test('mergeDecision holds on agent-changes-requested and on needs-human until human-approved', () => {
  const withLabels = (...names) => ({ ...ready, pr: { ...greenPr, labels: names.map((name) => ({ name })) } })
  assert.deepEqual(failed(mergeDecision(withLabels('automerge', 'agent-changes-requested'))), ['no agent-changes-requested'])
  assert.deepEqual(failed(mergeDecision(withLabels('automerge', 'needs-human'))), ['no needs-human, or human-approved'])
  assert.equal(mergeDecision(withLabels('automerge', 'needs-human', 'human-approved')).merge, true)
})

test('mergeDecision holds while any other check is pending or failed and names it', () => {
  const pending = [...greenChecks, { name: 'e2e / e2e tests', status: 'queued', conclusion: null }]
  const decision = mergeDecision({ ...ready, checks: pending })
  assert.deepEqual(failed(decision), ['all checks finished green'])
  assert.match(decision.conditions.find((c) => !c.ok).detail, /e2e \/ e2e tests: queued/)
  const red = greenChecks.map((c) => (c.name === 'ci / static checks' ? { ...c, conclusion: 'failure' } : c))
  assert.match(mergeDecision({ ...ready, checks: red }).conditions.find((c) => !c.ok).detail, /static checks: failure/)
})

test('mergeDecision judges each check by its newest run that was not skipped', () => {
  const at = (check, startedAt) => ({ ...check, started_at: startedAt })
  const gate = (conclusion, startedAt) => at({ name: 'review / gate', status: 'completed', conclusion }, startedAt)
  const others = greenChecks.filter((c) => !c.name.endsWith('gate'))
  // A label event that can't change the verdict skips the gate; the earlier verdict stands.
  assert.equal(mergeDecision({ ...ready, checks: [...others, gate('success', 't1'), gate('skipped', 't2')] }).merge, true)
  // A failed gate fixed by a later run (e.g. human-approved added) no longer holds the PR.
  assert.equal(mergeDecision({ ...ready, checks: [...others, gate('failure', 't1'), gate('success', 't2')] }).merge, true)
  assert.deepEqual(failed(mergeDecision({ ...ready, checks: [...others, gate('success', 't1'), gate('failure', 't2')] })), [
    'all checks finished green',
    'gate passed',
  ])
  assert.deepEqual(failed(mergeDecision({ ...ready, checks: [...others, gate('skipped', 't1')] })), ['gate passed'])
})

test('mergeDecision requires a passed gate and an up-to-date branch', () => {
  const noGate = greenChecks.filter((c) => !c.name.endsWith('gate'))
  assert.deepEqual(failed(mergeDecision({ ...ready, checks: noGate })), ['gate passed'])
  assert.deepEqual(failed(mergeDecision({ ...ready, behindBy: 2 })), ['up to date with main'])
})

function fakeGh(responses) {
  const calls = []
  const gh = (args) => {
    calls.push(args)
    const key = Object.keys(responses).find((prefix) => args.join(' ').startsWith(prefix))
    if (key === undefined) throw new Error(`unexpected gh call: ${args.join(' ')}`)
    return responses[key]
  }
  return { gh, calls }
}

const apiResponses = (pr) => ({
  [`api repos/o/r/commits/${SHA}/pulls`]: JSON.stringify([{ number: 7, state: 'open' }]),
  'pr view 7': JSON.stringify(pr),
  [`api repos/o/r/commits/${SHA}/check-runs`]: JSON.stringify({ check_runs: greenChecks }),
  [`api repos/o/r/compare/main...${SHA}`]: JSON.stringify({ behind_by: 0 }),
  'pr merge 7': '',
})

test('mergeIfReady merges with the merge <branch> subject, pinned to the evaluated commit', () => {
  const { gh, calls } = fakeGh(apiResponses(greenPr))
  const lines = []
  const decision = mergeIfReady({ repo: 'o/r', sha: SHA, gh, report: (line) => lines.push(line) })
  assert.equal(decision.merge, true)
  const merge = calls.find((args) => args[1] === 'merge')
  assert.deepEqual(merge, ['pr', 'merge', '7', '--repo', 'o/r', '--merge', '--subject', 'merge buy-30-lint', '--body', '', '--match-head-commit', SHA])
  assert.match(lines.join('\n'), /merged/)
})

test('mergeIfReady reports the failed conditions and does not merge a held PR', () => {
  const { gh, calls } = fakeGh(apiResponses({ ...greenPr, labels: [] }))
  const lines = []
  mergeIfReady({ repo: 'o/r', sha: SHA, gh, report: (line) => lines.push(line) })
  assert.equal(calls.some((args) => args[1] === 'merge'), false)
  assert.match(lines.join('\n'), /\| labelled automerge \| no \|/)
})

test('mergeIfReady does nothing when no open PR has the commit', () => {
  const { gh, calls } = fakeGh({ [`api repos/o/r/commits/${SHA}/pulls`]: JSON.stringify([{ number: 7, state: 'closed' }]) })
  const lines = []
  assert.equal(mergeIfReady({ repo: 'o/r', sha: SHA, gh, report: (line) => lines.push(line) }), null)
  assert.equal(calls.length, 1)
  assert.match(lines.join('\n'), /no open PR/)
})
