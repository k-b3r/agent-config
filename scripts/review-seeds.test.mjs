import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildSimPrompt, extractModel, extractPrompt, judge, parseLabels } from './review-seeds.mjs'

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
