import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyTouchedFiles, findAddedMarkers, parseTodoPaths, renderReport } from './deviations.mjs'

test('parseTodoPaths reads backticked and bare paths from bullet and checkbox lines', () => {
  const todo = [
    '# TODO',
    '- `src/domains/comps.ts`: add comps query',
    '- [ ] src/workers/comps/index.ts - wire the loop',
    '- [x] `db/schema.sql`',
    'Notes without a bullet are ignored: src/ignored.ts',
  ].join('\n')
  assert.deepEqual(parseTodoPaths(todo), ['src/domains/comps.ts', 'src/workers/comps/index.ts', 'db/schema.sql'])
})

test('findAddedMarkers reports only added lines, with file and line number', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +10,3 @@',
    ' const kept = 1',
    '-const old = x as any',
    '+const fresh = y as any // SPIKE-HACK: skip parsing for now',
    '+const ok = 2',
  ].join('\n')
  assert.deepEqual(findAddedMarkers(diff), [
    { file: 'src/a.ts', line: 11, kind: 'SPIKE-HACK', text: 'const fresh = y as any // SPIKE-HACK: skip parsing for now' },
    { file: 'src/a.ts', line: 11, kind: 'as any', text: 'const fresh = y as any // SPIKE-HACK: skip parsing for now' },
  ])
})

test('findAddedMarkers tracks line numbers across hunks and files', () => {
  const diff = [
    '+++ b/src/a.ts',
    '@@ -1 +1,2 @@',
    '+// TODO real retry',
    '+ok',
    '+++ b/src/b.py',
    '@@ -5 +7 @@',
    '+x = f()  # type: ignore',
  ].join('\n')
  assert.deepEqual(
    findAddedMarkers(diff).map((m) => `${m.file}:${m.line}:${m.kind}`),
    ['src/a.ts:1:TODO', 'src/b.py:7:type: ignore'],
  )
})

test('classifyTouchedFiles separates stub edits, off-plan files, and untouched todos', () => {
  const result = classifyTouchedFiles({
    spikeFiles: ['src/types.ts', 'src/a.ts', 'src/surprise.ts', 'docs/spikes/comps/notes.md'],
    stubFiles: ['src/types.ts'],
    todoPaths: ['src/a.ts', 'src/never-touched.ts'],
    ignorePrefix: 'docs/spikes/',
  })
  assert.deepEqual(result, {
    stubEdits: ['src/types.ts'],
    offPlan: ['src/surprise.ts'],
    untouchedTodos: ['src/never-touched.ts'],
  })
})

test('renderReport marks every evidence item for the reviewer and says none explicitly', () => {
  const report = renderReport({
    feature: 'comps',
    stubDiff: '',
    classification: { stubEdits: [], offPlan: ['src/surprise.ts'], untouchedTodos: [] },
    markers: [{ file: 'src/a.ts', line: 3, kind: 'SPIKE-HACK', text: '// SPIKE-HACK: fake data' }],
  })
  assert.match(report, /## Stub changes \(data structures, interfaces\)\n\nnone/)
  assert.match(report, /- \[ \] `src\/surprise.ts`/)
  assert.match(report, /- \[ \] `src\/a.ts:3` SPIKE-HACK: `\/\/ SPIKE-HACK: fake data`/)
})
