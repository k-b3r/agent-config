import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calibrationTable, collectEvidence, markPending, openPrForSha, parseMarker, renderComment, renderFactors, renderPending, revertedPrs, scoreEvidence, setTierLabel, tickedRisks, TIER_LABELS, upsertComment } from './pr-confidence.mjs'
import { REVIEW_COVERED_STEP } from './pr-automation.mjs'

const clean = {
  checks: { failing: [], pending: [] },
  labels: [],
  reviewed: true,
  reviewedCommits: 1,
  risks: [],
  linesChanged: 40,
  files: ['src/a.ts', 'src/a.test.ts'],
}
const names = (result) => result.factors.map((f) => f.name)

test('a green, reviewed, tested, small PR is high with no factors', () => {
  const result = scoreEvidence(clean)
  assert.deepEqual([result.tier, result.score, names(result)], ['high', 100, []])
})

test('a failing check or an open blocking review forces low whatever else is true', () => {
  const failing = scoreEvidence({ ...clean, checks: { failing: ['ci / unit tests'], pending: [] } })
  assert.equal(failing.tier, 'low')
  assert.match(failing.factors[0].detail, /ci \/ unit tests/)
  assert.equal(scoreEvidence({ ...clean, labels: ['agent-changes-requested'] }).tier, 'low')
})

test('running checks cost a little and say the label will be refreshed', () => {
  const result = scoreEvidence({ ...clean, checks: { failing: [], pending: ['ci / static'] } })
  assert.deepEqual([result.tier, result.score], ['high', 90])
  assert.match(result.factors[0].detail, /refreshed/)
})

test('missing review coverage drops a PR to medium; many review rounds cost more', () => {
  assert.deepEqual([scoreEvidence({ ...clean, reviewed: false }).tier, scoreEvidence({ ...clean, reviewed: false }).score], ['medium', 60])
  const circling = scoreEvidence({ ...clean, reviewedCommits: 4 })
  assert.deepEqual([circling.tier, circling.score, names(circling)], ['high', 80, ['review rounds']])
  assert.equal(scoreEvidence({ ...clean, reviewedCommits: 3 }).score, 100)
})

test('a needs-human PR is penalised until a human approves it', () => {
  assert.deepEqual(names(scoreEvidence({ ...clean, labels: ['needs-human'] })), ['open decision'])
  assert.deepEqual(names(scoreEvidence({ ...clean, labels: ['needs-human', 'human-approved'] })), [])
})

test('ticked risk boxes cost 20 each, capped at 40', () => {
  assert.equal(scoreEvidence({ ...clean, risks: ['Touches user data'] }).score, 80)
  assert.equal(scoreEvidence({ ...clean, risks: ['a', 'b', 'c'] }).score, 60)
})

test('size: over 400 lines costs 10, over 1000 costs 25', () => {
  assert.equal(scoreEvidence({ ...clean, linesChanged: 400 }).score, 100)
  assert.equal(scoreEvidence({ ...clean, linesChanged: 401 }).score, 90)
  assert.equal(scoreEvidence({ ...clean, linesChanged: 1001 }).score, 75)
})

test('code without a test file costs 20; docs, config and workflows alone do not', () => {
  assert.deepEqual(names(scoreEvidence({ ...clean, files: ['src/a.ts'] })), ['tests'])
  assert.deepEqual(names(scoreEvidence({ ...clean, files: ['README.md', 'docs/x.md', 'package.json'] })), [])
  assert.deepEqual(names(scoreEvidence({ ...clean, files: ['scripts/a.test.mjs', 'scripts/a.mjs'] })), [])
})

test('a PR that changes workflows is flagged, and the score never goes below 0', () => {
  assert.deepEqual(names(scoreEvidence({ ...clean, files: ['.github/workflows/ci.yml'] })), ['workflow files'])
  const worst = scoreEvidence({ ...clean, reviewed: false, risks: ['a', 'b'], linesChanged: 2000, files: ['src/a.ts'], labels: ['needs-human'] })
  assert.equal(worst.score >= 0, true)
  assert.equal(worst.tier, 'low')
})

test('renderFactors lists every factor with its points and evidence', () => {
  const text = renderFactors(scoreEvidence({ ...clean, files: ['src/a.ts'] }))
  assert.match(text, /### Confidence: high \(80\/100\)/)
  assert.match(text, /\| tests \| -20 \| 1 code file\(s\) changed, no test file \|/)
  assert.match(renderFactors(scoreEvidence(clean)), /\| none \| 0 \|/)
})

// A fake gh answering the calls collectEvidence and reviewCovered make.
const SHA = 'head1'
const fakeGh = ({ checkRuns, view, coveredShas = [SHA], branchShas = [SHA] }) => (args) => {
  const [first, second, third] = args
  if (first === 'pr' && second === 'view') return JSON.stringify(view)
  const path = args[1]
  if (path.includes('/check-runs')) return JSON.stringify({ check_runs: checkRuns })
  if (path.includes('actions/runs?event=pull_request&branch=')) {
    return JSON.stringify({ workflow_runs: branchShas.map((sha) => ({ name: 'pr-review', head_sha: sha })) })
  }
  const byHead = path.match(/actions\/runs\?head_sha=(\w+)&/)
  if (byHead) return JSON.stringify({ workflow_runs: [{ id: `run-${byHead[1]}` }] })
  const jobs = path.match(/actions\/runs\/run-(\w+)\/jobs/)
  if (jobs) {
    const conclusion = coveredShas.includes(jobs[1]) ? 'success' : 'skipped'
    return JSON.stringify({ jobs: [{ name: 'review / agent-review', steps: [{ name: REVIEW_COVERED_STEP, conclusion }] }] })
  }
  throw new Error(`unexpected gh call: ${args.join(' ')}`)
}
const view = {
  additions: 30,
  deletions: 10,
  files: [{ path: 'src/a.ts' }, { path: 'src/a.test.ts' }],
  labels: [{ name: 'automerge' }],
  body: '## Risks\n\n- [ ] Touches auth\n- [x] Touches user data\n- [X] Touches infra, CI or secrets\n',
  headRefOid: SHA,
  headRefName: 'feature',
}

test('collectEvidence reads facts: failing and pending checks, ticked risks, coverage, size, files', () => {
  const checkRuns = [
    { name: 'ci / unit tests', status: 'completed', conclusion: 'failure' },
    { name: 'ci / static checks', status: 'in_progress', conclusion: null },
    { name: 'integration / x', status: 'completed', conclusion: 'skipped' },
    { name: 'review / gate', status: 'in_progress', conclusion: null },
    { name: 'merge / auto-merge evaluate', status: 'in_progress', conclusion: null },
    { name: 'merge / confidence', status: 'in_progress', conclusion: null },
  ]
  const evidence = collectEvidence({ repo: 'o/r', pr: 7, gh: fakeGh({ checkRuns, view }) })
  assert.deepEqual(evidence.checks, { failing: ['ci / unit tests'], pending: ['ci / static checks'] })
  assert.deepEqual(evidence.risks, ['Touches user data', 'Touches infra, CI or secrets'])
  assert.deepEqual([evidence.reviewed, evidence.reviewedCommits, evidence.linesChanged], [true, 1, 40])
  assert.deepEqual(evidence.files, ['src/a.ts', 'src/a.test.ts'])
  assert.deepEqual(evidence.labels, ['automerge'])
})

test('collectEvidence counts reviewed commits, not pushes, and marks an unreviewed head', () => {
  const gh = fakeGh({ checkRuns: [], view, coveredShas: ['a', 'b'], branchShas: ['a', 'b', 'c', SHA] })
  const evidence = collectEvidence({ repo: 'o/r', pr: 7, gh })
  assert.deepEqual([evidence.reviewed, evidence.reviewedCommits], [false, 2])
})

test('setTierLabel sets one confidence label, removes the others, and does nothing when current', () => {
  const calls = []
  const gh = (labels) => (args) => {
    calls.push(args)
    return args[0] === 'api' ? JSON.stringify(labels.map((name) => ({ name }))) : ''
  }
  assert.equal(setTierLabel({ repo: 'o/r', pr: 7, tier: 'high', gh: gh(['bug', 'confidence-low']) }), true)
  const edit = calls.find((c) => c[0] === 'pr' && c[1] === 'edit')
  assert.deepEqual(edit.slice(-4), ['--add-label', 'confidence-high', '--remove-label', 'confidence-low'])
  assert.ok(calls.some((c) => c[0] === 'label' && c[1] === 'create' && c[2] === TIER_LABELS.high[0]))
  calls.length = 0
  assert.equal(setTierLabel({ repo: 'o/r', pr: 7, tier: 'high', gh: gh(['confidence-high']) }), false)
  assert.equal(calls.filter((c) => c[0] !== 'api').length, 0)
})

test('revertedPrs finds reverts from PR bodies and from git revert subjects', () => {
  const merged = [
    { number: 1, title: 'add x', body: '' },
    { number: 2, title: 'add y', body: '' },
    { number: 3, title: 'Revert "add x"', body: 'Reverts o/r#1' },
    { number: 4, title: 'add z', body: '' },
  ]
  const reverted = revertedPrs({ merged, commitSubjects: ['Revert "add y"', 'unrelated', 'Revert "never merged here"'] })
  assert.deepEqual([...reverted].sort(), [1, 2])
})

test('calibrationTable counts PRs and reverts per tier', () => {
  const table = calibrationTable([
    { tier: 'high', reverted: false },
    { tier: 'high', reverted: true },
    { tier: 'low', reverted: false },
  ])
  assert.match(table, /\| high \| 2 \| 1 \|/)
  assert.match(table, /\| medium \| 0 \| 0 \|/)
  assert.match(table, /\| low \| 1 \| 0 \|/)
})

test('openPrForSha finds the open PR with that head, and null for a push to main or a closed PR', () => {
  const gh = (prs) => () => JSON.stringify(prs)
  const open = { number: 9, state: 'open', head: { sha: 'abc' } }
  assert.equal(openPrForSha({ repo: 'o/r', sha: 'abc', gh: gh([open]) }), 9)
  assert.equal(openPrForSha({ repo: 'o/r', sha: 'abc', gh: gh([]) }), null)
  assert.equal(openPrForSha({ repo: 'o/r', sha: 'abc', gh: gh([{ ...open, state: 'closed' }]) }), null)
  assert.equal(openPrForSha({ repo: 'o/r', sha: 'abc', gh: gh([{ ...open, head: { sha: 'older' } }]) }), null)
})

test('tickedRisks reads only the Risks section: other checklists and unticked boxes do not count', () => {
  const body = [
    '## Verified',
    '- [x] tests pass',
    '',
    '## Risks',
    '- [ ] Touches auth',
    '- [x] Touches money',
    '',
    '## Unresolved questions',
    '- [x] done',
  ].join('\n')
  assert.deepEqual(tickedRisks(body), ['Touches money'])
  assert.deepEqual(tickedRisks('- [x] no risks heading'), [])
  assert.deepEqual(tickedRisks(null), [])
})

test('tests factor recognises shell, Go and Python test files, not just JS and TS', () => {
  for (const test of ['scripts/a.test.sh', 'pkg/a_test.go', 'tests/test_a.py', 'pkg/a_test.py', 'src/a.spec.ts']) {
    assert.deepEqual(names(scoreEvidence({ ...clean, files: ['src/a.ts', test] })), [], test)
  }
  assert.deepEqual(names(scoreEvidence({ ...clean, files: ['scripts/a.sh'] })), ['tests'])
})

// A stateful fake gh for the comment API: a list of comments, POST creates, PATCH edits.
const fakeComments = (initial = []) => {
  const comments = initial.map((body, i) => ({ id: 100 + i, body }))
  const calls = []
  const gh = (args) => {
    calls.push(args)
    if (args[0] === 'api' && args.includes('--jq')) {
      const jq = args[args.indexOf('--jq') + 1]
      const mine = comments.filter((c) => c.body.startsWith('<!-- pr-confidence'))
      return jq.endsWith('.body') ? mine.map((c) => c.body).join('\n') : mine.map((c) => JSON.stringify(c)).join('\n')
    }
    if (args.includes('PATCH')) {
      const id = Number(args[args.indexOf('PATCH') + 1].split('/').pop())
      comments.find((c) => c.id === id).body = args.at(-1).replace(/^body=/, '')
      return ''
    }
    if (args[0] === 'api' && args.includes('-f')) {
      comments.push({ id: 200 + comments.length, body: args.at(-1).replace(/^body=/, '') })
      return ''
    }
    if (args[0] === 'api') return JSON.stringify([])
    return ''
  }
  return { gh, comments, calls }
}

test('renderComment: tier, small score, the factor table, a not-a-probability note, a hidden marker', () => {
  const body = renderComment({ result: scoreEvidence({ ...clean, files: ['src/a.ts'] }), previous: null })
  assert.match(body, /^<!-- pr-confidence tier=high score=80 -->/)
  assert.match(body, /### Confidence: high \(80\/100\)/)
  assert.match(body, /Not a probability/)
  assert.match(body, /\| tests \| -20 \|/)
  assert.doesNotMatch(body, /Was /)
})

test('renderComment says what changed since the last verdict, and carries one over a pending marker', () => {
  const result = scoreEvidence({ ...clean, reviewed: false })
  assert.match(renderComment({ result, previous: { tier: 'high', score: 100 } }), /Was high \(100\) before the last update\./)
  assert.doesNotMatch(renderComment({ result, previous: { tier: 'medium', score: 60 } }), /Was /)
  const pending = parseMarker(renderPending({ tier: 'high', score: 100 }))
  assert.deepEqual(pending, { tier: 'pending', score: 0, was: { tier: 'high', score: 100 } })
  assert.match(renderComment({ result, previous: pending }), /Was high \(100\)/)
  assert.deepEqual(parseMarker(renderPending(pending)).was, { tier: 'high', score: 100 })
  assert.equal(parseMarker('a normal comment'), null)
})

test('upsertComment creates once, edits in place, and writes nothing when the body is unchanged', () => {
  const { gh, comments, calls } = fakeComments(['someone else said hi'])
  const body = renderComment({ result: scoreEvidence(clean), previous: null })
  assert.equal(upsertComment({ repo: 'o/r', pr: 7, body, gh }).action, 'created')
  assert.equal(comments.length, 2)
  const writes = () => calls.filter((c) => c.includes('-f')).length
  assert.equal(upsertComment({ repo: 'o/r', pr: 7, body, gh }).action, 'unchanged')
  assert.equal(writes(), 1)
  const next = renderComment({ result: scoreEvidence({ ...clean, reviewed: false }), previous: { tier: 'high', score: 100 } })
  const result = upsertComment({ repo: 'o/r', pr: 7, body: next, gh })
  assert.deepEqual([result.action, result.previous.tier], ['updated', 'high'])
  assert.equal(comments.length, 2)
  assert.equal(comments[1].body, next)
})

test('markPending swaps the tier label for pending and rewrites the comment, keeping the earlier verdict', () => {
  const labels = ['confidence-high']
  const fake = fakeComments([renderComment({ result: scoreEvidence(clean), previous: null })])
  const gh = (args) => {
    if (args[0] === 'api' && args[1].endsWith('/labels')) return JSON.stringify(labels.map((name) => ({ name })))
    if (args[0] === 'label') return ''
    if (args[0] === 'pr' && args[1] === 'edit') {
      labels.length = 0
      labels.push('confidence-pending')
      return ''
    }
    return fake.gh(args)
  }
  markPending({ repo: 'o/r', pr: 7, gh })
  assert.deepEqual(labels, ['confidence-pending'])
  assert.deepEqual(parseMarker(fake.comments[0].body), { tier: 'pending', score: 0, was: { tier: 'high', score: 100 } })
  assert.match(fake.comments[0].body, /A push landed \(it was high, 100\)/)
})

test('a pending label is replaced when a tier is set', () => {
  const calls = []
  const gh = (args) => {
    calls.push(args)
    return args[0] === 'api' ? JSON.stringify([{ name: 'confidence-pending' }]) : ''
  }
  setTierLabel({ repo: 'o/r', pr: 7, tier: 'medium', gh })
  const edit = calls.find((c) => c[0] === 'pr' && c[1] === 'edit')
  assert.deepEqual(edit.slice(-4), ['--add-label', 'confidence-medium', '--remove-label', 'confidence-pending'])
})
