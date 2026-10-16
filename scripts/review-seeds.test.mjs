import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
  buildSeedRepo,
  buildSimPrompt,
  classifyRun,
  extractModel,
  extractPrompt,
  judge,
  limitNotice,
  loadSeeds,
  parseLabels,
  validateSeed,
} from './review-seeds.mjs'

const WORKFLOW = [
  '      - uses: anthropics/claude-code-action@v1',
  '        with:',
  '          prompt: |',
  '            REPO: ${{ github.repository }}',
  '            PR NUMBER: ${{ github.event.pull_request.number }}',
  '',
  '            Standards: .agent-config/CODING_STANDARDS.md',
  '          claude_args: |',
  '            --allowedTools "Read"',
].join('\n')

test('extractPrompt dedents the prompt block and fills in the workflow expressions', () => {
  const prompt = extractPrompt(WORKFLOW, { repository: 'k-b3r/x', number: 7, agentConfigDir: '/cfg' })
  assert.equal(prompt, 'REPO: k-b3r/x\nPR NUMBER: 7\n\nStandards: /cfg/CODING_STANDARDS.md')
})

test('extractPrompt throws when the workflow has no prompt block', () => {
  assert.throws(() => extractPrompt('name: x'), /no prompt block/)
})

test('buildSimPrompt names the seed branch, the PR body and the labels line the verdict is read from', () => {
  const text = buildSimPrompt('PROMPT', { branch: 'seed-1', body: 'tidy up' })
  assert.match(text, /origin\/main\.\.\.origin\/seed-1/)
  assert.match(text, /PR body: tidy up/)
  assert.match(text, /finish with one line: LABELS:/)
  assert.ok(text.endsWith('PROMPT'))
})

test('buildSimPrompt diffs against the seed base when one is given', () => {
  const text = buildSimPrompt('PROMPT', { branch: 'pr-head', base: 'abc123' })
  assert.match(text, /git diff abc123\.\.\.origin\/pr-head/)
  assert.match(text, /git log --format=%s abc123\.\.origin\/pr-head/)
})

test('parseLabels reads which labels the closing LABELS line adds', () => {
  assert.deepEqual(parseLabels('x\nLABELS: add `agent-changes-requested`; no `needs-human`'), { blocking: true, needsHuman: false })
  assert.deepEqual(parseLabels('LABELS: add `agent-changes-requested` and `needs-human`'), { blocking: true, needsHuman: true })
  assert.deepEqual(parseLabels('LABELS: remove `agent-changes-requested`; no `needs-human`'), { blocking: false, needsHuman: false })
})

test('parseLabels returns null when the review printed no LABELS line', () => {
  assert.equal(parseLabels('No issues found.'), null)
})

test('judge checks blocking always and needsHuman only when the seed states it', () => {
  assert.equal(judge({ blocking: true }, { blocking: true, needsHuman: true }), true)
  assert.equal(judge({ blocking: true, needsHuman: false }, { blocking: true, needsHuman: true }), false)
  assert.equal(judge({ blocking: false }, { blocking: true, needsHuman: false }), false)
  assert.equal(judge({ blocking: true }, null), false)
})

test('seeds.json names are unique and every seed states a branch, a rule and an expectation', () => {
  const seeds = JSON.parse(readFileSync(new URL('../review-seeds/seeds.json', import.meta.url), 'utf8'))
  assert.equal(new Set(seeds.map((s) => s.name)).size, seeds.length)
  for (const seed of seeds) {
    assert.ok(seed.branch && seed.rule && typeof seed.expect.blocking === 'boolean', seed.name)
  }
})

test('extractModel reads the workflow model input default', () => {
  const yaml = 'on:\n  workflow_call:\n    inputs:\n      model:\n        description: >-\n          pinned\n        type: string\n        default: claude-opus-5-5\n      other:\n        default: x\n'
  assert.equal(extractModel(yaml), 'claude-opus-5-5')
})

test('extractModel reads the real review workflow', () => {
  const real = readFileSync(new URL('../.github/workflows/pr-review.yml', import.meta.url), 'utf8')
  assert.match(extractModel(real), /^claude-/)
})

test('limitNotice finds the usage-limit line and returns null for a real review', () => {
  assert.equal(limitNotice("You've hit your session limit · resets 4:40pm (Asia/Manila)\n"), "You've hit your session limit · resets 4:40pm (Asia/Manila)")
  assert.equal(limitNotice('No issues found.\nLABELS: remove `agent-changes-requested`'), null)
})

test('classifyRun scores a limit reply as an error, not a miss', () => {
  const run = classifyRun({ blocking: true }, "You've hit your session limit · resets 4:40pm")
  assert.equal(run.status, 'error')
  assert.match(run.notice, /session limit/)
})

test('classifyRun scores a verdict against the expectation', () => {
  assert.equal(classifyRun({ blocking: true }, 'LABELS: add `agent-changes-requested`').status, 'ok')
  assert.equal(classifyRun({ blocking: true }, 'LABELS: remove `agent-changes-requested`').status, 'miss')
})

// A throwaway base project and seeds directory, written from a map of relative path -> text.
function scratch(files) {
  const root = mkdtempSync(join(tmpdir(), 'seeds-test-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const seedJson = (extra = {}) =>
  JSON.stringify({ name: 'one', rule: 'a rule', covers: 'a distinctive rule substring', expect: { blocking: true }, message: 'change a', ...extra })

const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })

test('loadSeeds reads seed.json and an overlay, and names the branch after the seed', () => {
  const root = scratch({ 'one/seed.json': seedJson(), 'one/files/src/a.ts': 'export const a = 2\n' })
  const [seed] = loadSeeds(root)
  assert.equal(seed.name, 'one')
  assert.equal(seed.branch, 'one')
  assert.deepEqual(seed.steps.map((s) => s.message), ['change a'])
})

test('loadSeeds orders steps by directory name and reads each step message', () => {
  const root = scratch({
    'two/seed.json': seedJson({ name: 'two', message: undefined }),
    'two/steps/02-behavior/message.txt': 'add the setting\n',
    'two/steps/02-behavior/files/src/a.ts': 'x\n',
    'two/steps/01-refactor/message.txt': 'rename helper\n',
    'two/steps/01-refactor/files/src/a.ts': 'y\n',
  })
  const [seed] = loadSeeds(root)
  assert.deepEqual(seed.steps.map((s) => s.message), ['rename helper', 'add the setting'])
})

test('buildSeedRepo commits the base as origin/main and each seed as its own origin branch with one commit per step', () => {
  const base = scratch({ 'src/a.ts': 'export const a = 1\n', 'src/gone.ts': 'export const g = 1\n' })
  const seeds = scratch({
    'one/seed.json': seedJson(),
    'one/files/src/a.ts': 'export const a = 2\n',
    'one/files/src/new.ts': 'export const n = 1\n',
    'one/remove.txt': 'src/gone.ts\n',
    'two/seed.json': seedJson({ name: 'two', message: undefined }),
    'two/steps/01-first/message.txt': 'first step\n',
    'two/steps/01-first/files/src/a.ts': 'export const a = 3\n',
    'two/steps/02-second/message.txt': 'second step\n',
    'two/steps/02-second/files/src/a.ts': 'export const a = 4\n',
  })
  const repo = buildSeedRepo({ baseDir: base, seeds: loadSeeds(seeds) })
  assert.deepEqual(git(repo, 'diff', '--name-status', 'origin/main...origin/one').trim().split('\n').toSorted(), ['A\tsrc/new.ts', 'D\tsrc/gone.ts', 'M\tsrc/a.ts'])
  assert.deepEqual(git(repo, 'log', '--format=%s', 'origin/main..origin/two').trim().split('\n'), ['second step', 'first step'])
  assert.equal(git(repo, 'show', 'origin/main:src/a.ts'), 'export const a = 1\n')
})

test('validateSeed accepts a well-formed seed and a control with no covers', () => {
  assert.deepEqual(validateSeed({ name: 'one', rule: 'r', covers: 'a distinctive rule substring', expect: { blocking: true }, steps: [{ message: 'change a' }] }), [])
  assert.deepEqual(validateSeed({ name: 'c', rule: 'control', covers: null, expect: { blocking: false }, steps: [{ message: 'fix typo' }] }), [])
})

test('validateSeed names each problem: bad name, short covers, missing expectation, bad commit message, no steps', () => {
  const problems = validateSeed({ name: 'Bad Name', rule: '', covers: 'short', expect: {}, steps: [{ message: 'Add thing.' }] })
  assert.ok(problems.some((p) => /name/.test(p)))
  assert.ok(problems.some((p) => /covers/.test(p)))
  assert.ok(problems.some((p) => /rule/.test(p)))
  assert.ok(problems.some((p) => /blocking/.test(p)))
  assert.ok(problems.some((p) => /commit message/.test(p)))
  assert.ok(validateSeed({ name: 'x', rule: 'r', covers: null, expect: { blocking: false }, steps: [] }).some((p) => /step/.test(p)))
})
