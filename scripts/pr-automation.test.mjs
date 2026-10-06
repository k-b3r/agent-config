import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prDiffUnchanged, mergeDecision, mergeIfReady, sameChange } from './pr-automation.mjs'

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

const prDiff = (indexLine, hunkHeader, context) => `diff --git a/src/a.ts b/src/a.ts
${indexLine}
--- a/src/a.ts
+++ b/src/a.ts
${hunkHeader}
 ${context}
-old line
+new line
`

test('sameChange treats a diff that only moved (new blob ids, shifted line numbers) as the same change', () => {
  const before = prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@ function f() {', 'kept')
  const after = prDiff('index 3333333..4444444 100644', '@@ -14,3 +14,3 @@ function f() {', 'kept')
  assert.equal(sameChange(before, after), true)
})

test('sameChange sees an edited line or changed context as a different change', () => {
  const before = prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@', 'kept')
  assert.equal(sameChange(before, before.replace('+new line', '+newer line')), false)
  assert.equal(sameChange(before, prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@', 'changed by main')), false)
})

const generatedDiff = (path, line) => `diff --git a/${path} b/${path}
index 5555555..6666666 100644
--- a/${path}
+++ b/${path}
@@ -1,1 +1,1 @@
-old ${line}
+new ${line}
`

test('sameChange ignores files under the generated paths it is given', () => {
  const code = prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@', 'kept')
  const before = generatedDiff('docs-site/index.html', 'v1') + code
  const after = generatedDiff('docs-site/index.html', 'v2') + code + generatedDiff('docs-site/new/page.html', 'v1')
  assert.equal(sameChange(before, after, ['docs-site']), true)
  assert.equal(sameChange(code, after, ['docs-site/']), true)
})

test('sameChange still sees a change outside the generated paths, or in a path that only shares their prefix', () => {
  const code = prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@', 'kept')
  const before = generatedDiff('docs-site/index.html', 'v1') + code
  assert.equal(sameChange(before, before.replace('+new line', '+newer line'), ['docs-site']), false)
  assert.equal(sameChange(code, code + generatedDiff('docs-site-src/page.md', 'v1'), ['docs-site']), false)
  assert.equal(sameChange(before, code), false)
})

test('prDiffUnchanged ignores a push that only regenerated files under the generated paths', () => {
  const code = prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@', 'kept')
  const { gh } = fakeGh({
    'api -H Accept: application/vnd.github.diff repos/o/r/compare/main...old': code,
    'api -H Accept: application/vnd.github.diff repos/o/r/compare/main...new': code + generatedDiff('docs-site/a.html', 'v1'),
  })
  assert.equal(prDiffUnchanged({ repo: 'o/r', base: 'main', before: 'old', after: 'new', generatedPaths: ['docs-site'], gh }), true)
  assert.equal(prDiffUnchanged({ repo: 'o/r', base: 'main', before: 'old', after: 'new', gh }), false)
})

test('prDiffUnchanged compares the PR diff against its base before and after the push', () => {
  const diff = prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@', 'kept')
  const { gh, calls } = fakeGh({
    'api -H Accept: application/vnd.github.diff repos/o/r/compare/main...old': diff,
    'api -H Accept: application/vnd.github.diff repos/o/r/compare/main...new': diff.replace('@@ -10,3 +10,3 @@', '@@ -12,3 +12,3 @@'),
  })
  assert.equal(prDiffUnchanged({ repo: 'o/r', base: 'main', before: 'old', after: 'new', gh }), true)
  assert.equal(calls.length, 2)
})

test('prDiffUnchanged is false when the PR diff changed or cannot be fetched', () => {
  const diff = prDiff('index 1111111..2222222 100644', '@@ -10,3 +10,3 @@', 'kept')
  const changed = fakeGh({
    'api -H Accept: application/vnd.github.diff repos/o/r/compare/main...old': diff,
    'api -H Accept: application/vnd.github.diff repos/o/r/compare/main...new': diff.replace('+new line', '+other line'),
  })
  assert.equal(prDiffUnchanged({ repo: 'o/r', base: 'main', before: 'old', after: 'new', gh: changed.gh }), false)
  const failing = fakeGh({})
  assert.equal(prDiffUnchanged({ repo: 'o/r', base: 'main', before: 'old', after: 'new', gh: failing.gh }), false)
})
