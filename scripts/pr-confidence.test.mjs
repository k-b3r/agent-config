import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calibrationTable, carryProof, collectEvidence, hasRisksSection, markPending, markReviewer, openPrForSha, parseMarker, parseProof, parseReviewer, proofVerdict, revertState, reviewerVerdict, renderComment, renderFactors, renderPending, revertedPrs, scoreEvidence, setTierLabel, tickedRisks, TIER_LABELS, upsertComment, verifiedState } from './pr-confidence.mjs'
import { REVIEW_COVERED_STEP } from './pr-automation.mjs'

const clean = {
  checks: { failing: [], pending: [] },
  labels: [],
  reviewed: true,
  reviewedCommits: 1,
  risks: [],
  proof: { status: 'sufficient', claims: [] },
  verified: 'output',
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
const SHA = 'abc1234'
const fakeGh = ({ checkRuns, view, coveredShas = [SHA], branchShas = [SHA], comments = [] }) => (args) => {
  const [first, second] = args
  if (first === 'pr' && second === 'view') return JSON.stringify(view)
  const path = args.find((a) => a.startsWith('repos/')) ?? args[1]
  if (path.includes('/issues/') && path.endsWith('/comments')) return comments.map((body) => JSON.stringify(body)).join('\n')
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
  body: '## Risks\n\n- [ ] Touches auth\n- [x] Touches user data\n- [X] Touches infra, CI or secrets\n\n## Verified\n\n```\n3 passing\n```\n',
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

test('a PR with no Risks section loses 10 points; a Risks section that says none does not', () => {
  const missing = scoreEvidence({ ...clean, risksSection: false })
  assert.deepEqual([missing.score, names(missing)], [90, ['risk section']])
  assert.match(missing.factors[0].detail, /say "none"/)
  assert.deepEqual(names(scoreEvidence({ ...clean, risksSection: true })), [])
  assert.deepEqual(names(scoreEvidence(clean)), []) // evidence without the field is not penalised
})

test('hasRisksSection: the heading is enough, whatever it says under it', () => {
  assert.equal(hasRisksSection('## Intent\n\nx\n\n## Risks\n\nNone: docs only.\n'), true)
  assert.equal(hasRisksSection('## Intent\n\nx\n\n## What\n\ny'), false)
  assert.equal(hasRisksSection(''), false)
  assert.equal(hasRisksSection(null), false)
})

test('collectEvidence reads whether the body has a Risks section', () => {
  const noRisks = { ...view, body: '## What\n\ndone\n' }
  assert.equal(collectEvidence({ repo: 'o/r', pr: 7, gh: fakeGh({ checkRuns: [], view: noRisks }) }).risksSection, false)
  assert.equal(collectEvidence({ repo: 'o/r', pr: 7, gh: fakeGh({ checkRuns: [], view }) }).risksSection, true)
})

const fence = '```'
const verifiedBody = (text) => `## Intent\n\nx\n\n## Verified\n\n${text}\n\n## Unresolved questions\n\nnone\n`

test('verifiedState tells a missing, empty, text-only and output-backed Verified section apart', () => {
  assert.equal(verifiedState('## Intent\n\nx'), 'missing')
  assert.equal(verifiedState(null), 'missing')
  assert.equal(verifiedState(verifiedBody('')), 'empty')
  assert.equal(verifiedState(verifiedBody('not run')), 'empty')
  assert.equal(verifiedState(verifiedBody('<!-- paste output -->')), 'empty')
  assert.equal(verifiedState(verifiedBody('Proof per claim: test names, pasted output, screenshot.')), 'empty')
  assert.equal(verifiedState(verifiedBody('Commands run and their actual output (tests).')), 'empty')
  assert.equal(verifiedState(verifiedBody('ran the tests, all good')), 'text')
  assert.equal(verifiedState(verifiedBody(`${fence}\n\n${fence}`)), 'text')
  assert.equal(verifiedState(verifiedBody(`${fence}\n3 passing\n${fence}`)), 'output')
  assert.equal(verifiedState(verifiedBody('![after](https://example.com/a.png)')), 'output')
})

test('a missing or empty Verified section costs 20; text without output costs 10 only when code changed', () => {
  const missing = scoreEvidence({ ...clean, verified: 'missing' })
  assert.deepEqual([names(missing), missing.score, missing.tier], [['verified section'], 80, 'high'])
  assert.deepEqual([scoreEvidence({ ...clean, verified: 'empty' }).score], [80])
  const text = scoreEvidence({ ...clean, verified: 'text' })
  assert.deepEqual([names(text), text.score], [['verified output'], 90])
  assert.deepEqual(names(scoreEvidence({ ...clean, verified: 'text', files: ['README.md', 'docs/x.md'] })), [])
  assert.deepEqual(names(scoreEvidence({ ...clean, verified: 'text', files: ['.github/pull_request_template.md'] })), [])
})

test('proof sufficient and otherwise clean is high', () => {
  assert.deepEqual([scoreEvidence(clean).tier, scoreEvidence(clean).score], ['high', 100])
})

test('a missing proof verdict caps the tier at medium whatever the score', () => {
  const result = scoreEvidence({ ...clean, proof: null })
  assert.deepEqual([result.tier, result.score, names(result)], ['medium', 100, ['proof']])
  assert.match(result.factors[0].detail, /current head commit/)
})

test('an insufficient proof verdict caps at medium and lists the unproven claims', () => {
  const result = scoreEvidence({ ...clean, proof: { status: 'insufficient', claims: ['retry is bounded', 'no schema change'] } })
  assert.equal(result.tier, 'medium')
  assert.match(result.factors[0].detail, /Unproven: retry is bounded; no schema change/)
})

test('the proof cap never lifts a low tier', () => {
  assert.equal(scoreEvidence({ ...clean, proof: null, labels: ['agent-changes-requested'] }).tier, 'low')
})

test('a docs-only PR with a short statement and a sufficient verdict is high', () => {
  const docs = scoreEvidence({ ...clean, files: ['README.md'], verified: 'text' })
  assert.deepEqual([docs.tier, docs.score, names(docs)], ['high', 100, []])
})

test('parseProof reads the verdict line and the unproven claims under it', () => {
  assert.deepEqual(parseProof('No issues.\n\nproof: insufficient sha=ABC1234\n- claim one\n* claim two\n\nmore'), {
    status: 'insufficient',
    sha: 'abc1234',
    claims: ['claim one', 'claim two'],
  })
  assert.deepEqual(parseProof('proof: sufficient sha=abc1234'), { status: 'sufficient', sha: 'abc1234', claims: [] })
  assert.equal(parseProof('proof: sufficient'), null)
  assert.equal(parseProof('we have proof: sufficient sha=abc1234 here'), null)
  assert.equal(parseProof(null), null)
})

test('proofVerdict counts only a verdict for the current head: an older commit, a human comment or no comment is missing', () => {
  const verdict = (sha, status = 'sufficient') => `Summary\n\nproof: ${status} sha=${sha}`
  const read = (comments, sha = SHA) => proofVerdict({ repo: 'o/r', pr: 7, sha, gh: fakeGh({ comments }) })
  assert.deepEqual(read([verdict(SHA)]), { status: 'sufficient', claims: [] })
  assert.equal(read([verdict('def5678')]), null)
  assert.equal(read([]), null)
  assert.deepEqual(read([verdict('def5678'), verdict(SHA, 'insufficient')]), { status: 'insufficient', claims: [] })
  assert.deepEqual(read([verdict(SHA, 'insufficient'), verdict(SHA)]), { status: 'sufficient', claims: [] })
  assert.deepEqual(read([verdict(SHA.slice(0, 7))], `${SHA}0000`), { status: 'sufficient', claims: [] })
})

test('proofVerdict asks gh for bot comments only, and a gh failure is a missing verdict', () => {
  const calls = []
  proofVerdict({ repo: 'o/r', pr: 7, sha: SHA, gh: (args) => (calls.push(args), '') })
  assert.match(calls[0].join(' '), /user\.type == "Bot"/)
  assert.equal(proofVerdict({ repo: 'o/r', pr: 7, sha: SHA, gh: () => { throw new Error('boom') } }), null)
})

test('collectEvidence reads the proof verdict of the head commit and the Verified state', () => {
  const comments = ['review\n\nproof: insufficient sha=def5678\n- old', `review\n\nproof: insufficient sha=${SHA}\n- retry is bounded`]
  const evidence = collectEvidence({ repo: 'o/r', pr: 7, gh: fakeGh({ checkRuns: [], view, comments }) })
  assert.deepEqual(evidence.proof, { status: 'insufficient', claims: ['retry is bounded'] })
  assert.equal(evidence.verified, 'output')
  const stale = collectEvidence({ repo: 'o/r', pr: 7, gh: fakeGh({ checkRuns: [], view, comments: [comments[0]] }) })
  assert.equal(stale.proof, null)
})

test('carryProof repeats the verdict for the new head once, and never invents one', () => {
  const posted = []
  const comments = ['proof: insufficient sha=abc1234\n- retry is bounded']
  const gh = (extra) => (args) => {
    if (args.includes('-f')) {
      posted.push(args.at(-1))
      return ''
    }
    return fakeGh({ comments: [...comments, ...extra] })(args)
  }
  assert.equal(carryProof({ repo: 'o/r', pr: 7, from: 'abc1234', to: 'def5678', gh: gh([]) }), true)
  assert.match(posted[0], /^body=proof: insufficient sha=def5678\n- retry is bounded/)
  assert.equal(carryProof({ repo: 'o/r', pr: 7, from: 'abc1234', to: 'def5678', gh: gh([posted[0].slice(5)]) }), false)
  assert.equal(carryProof({ repo: 'o/r', pr: 7, from: '1111111', to: 'def5678', gh: gh([]) }), false)
  assert.equal(posted.length, 1)
})

test('a critical PR reviewed by the fallback model is capped at medium whatever the score', () => {
  const result = scoreEvidence({ ...clean, reviewer: 'deepseek-fallback' })
  assert.deepEqual([result.tier, result.score, names(result)], ['medium', 100, ['reviewer']])
  assert.match(result.factors[0].detail, /critical PR reviewed by the fallback model/)
  assert.equal(scoreEvidence({ ...clean, reviewer: null }).tier, 'high')
  assert.equal(scoreEvidence({ ...clean, reviewer: 'deepseek-fallback', labels: ['agent-changes-requested'] }).tier, 'low')
})

test('parseReviewer reads the marker line and nothing that merely mentions it', () => {
  assert.deepEqual(parseReviewer('x\n\nreviewer: deepseek-fallback sha=ABC1234\n'), { reviewer: 'deepseek-fallback', sha: 'abc1234' })
  assert.equal(parseReviewer('reviewer: deepseek-fallback'), null)
  assert.equal(parseReviewer('the reviewer: deepseek-fallback sha=abc1234 ran'), null)
  assert.equal(parseReviewer(null), null)
})

test('reviewerVerdict finds the fallback marker for the current head only', () => {
  const marker = (sha) => `reviewer: deepseek-fallback sha=${sha}`
  const read = (comments) => reviewerVerdict({ repo: 'o/r', pr: 7, sha: SHA, gh: fakeGh({ comments }) })
  assert.equal(read([marker(SHA)]), 'deepseek-fallback')
  assert.equal(read([marker('def5678')]), null)
  assert.equal(read([]), null)
  assert.equal(reviewerVerdict({ repo: 'o/r', pr: 7, sha: SHA, gh: () => { throw new Error('boom') } }), null)
})

test('collectEvidence carries the reviewer marker of the head commit', () => {
  const comments = [`proof: sufficient sha=${SHA}`, `reviewer: deepseek-fallback sha=${SHA}`]
  const evidence = collectEvidence({ repo: 'o/r', pr: 7, gh: fakeGh({ checkRuns: [], view, comments }) })
  assert.equal(evidence.reviewer, 'deepseek-fallback')
  assert.equal(collectEvidence({ repo: 'o/r', pr: 7, gh: fakeGh({ checkRuns: [], view, comments: [comments[0]] }) }).reviewer, null)
})

test('markReviewer posts the marker once per head, so a re-run does not repeat it', () => {
  const posted = []
  const gh = (comments) => (args) => {
    if (args.includes('-f')) {
      posted.push(args.at(-1))
      return ''
    }
    return fakeGh({ comments })(args)
  }
  assert.equal(markReviewer({ repo: 'o/r', pr: 7, sha: SHA, gh: gh([]) }), true)
  assert.match(posted[0], new RegExp(`^body=reviewer: deepseek-fallback sha=${SHA}$`))
  assert.equal(markReviewer({ repo: 'o/r', pr: 7, sha: SHA, gh: gh([posted[0].slice(5)]) }), false)
  assert.equal(posted.length, 1)
})

test('carryProof carries the fallback marker with the verdict, so a skipped re-review keeps the cap', () => {
  const posted = []
  const comments = ['proof: sufficient sha=abc1234', 'reviewer: deepseek-fallback sha=abc1234']
  const gh = (args) => {
    if (args.includes('-f')) {
      posted.push(args.at(-1))
      return ''
    }
    return fakeGh({ comments })(args)
  }
  assert.equal(carryProof({ repo: 'o/r', pr: 7, from: 'abc1234', to: 'def5678', gh }), true)
  assert.match(posted[0], /^body=proof: sufficient sha=def5678\n\nreviewer: deepseek-fallback sha=def5678\n/)
  assert.deepEqual(parseProof(posted[0].slice(5)), { status: 'sufficient', sha: 'def5678', claims: [] })
})

test('revertState tells a missing, untouched and filled How to revert section apart', () => {
  assert.equal(revertState('## Risks\n\nx'), 'missing')
  assert.equal(revertState(null), 'missing')
  assert.equal(revertState('## How to revert\n\nPer ticked box: what can go wrong and how to roll back. Skip when nothing is ticked.\n'), 'empty')
  assert.equal(revertState('## How to revert\n\n\n## Verified\n\nx'), 'empty')
  assert.equal(revertState('## How to revert\n\nRevert the merge commit; no data is changed.\n'), 'filled')
})

test('a ticked risk box with no revert plan loses 10 points on top of the box', () => {
  const ticked = { ...clean, risks: ['Touches infra, CI or secrets'] }
  const bare = scoreEvidence({ ...ticked, revert: 'empty' })
  assert.deepEqual(names(bare), ['risk boxes', 'how to revert'])
  assert.deepEqual(names(scoreEvidence({ ...ticked, revert: 'filled' })), ['risk boxes'])
  assert.deepEqual(names(scoreEvidence({ ...clean, revert: 'empty' })), [])
})
