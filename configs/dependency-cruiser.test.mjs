import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { cruise } from 'dependency-cruiser'
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config'

const require = createRequire(import.meta.url)
const { baseRules, baseOptions } = require('./dependency-cruiser.cjs')

// The fixture breaks each rule exactly once; catalog is the clean control.
const fixtures = fileURLToPath(new URL('./fixtures/depcruise/', import.meta.url))
process.chdir(fixtures)

const forbidden = baseRules({
  publicApis: ['src/modules/catalog', 'src/modules/collection'],
  heavyDeps: [{ packages: ['heavy-lib'], owner: 'src/modules/collection/browser.ts' }],
  inner: ['src/modules'],
  entryPoints: ['src/workers'],
})
const result = await cruise(
  ['src'],
  { ruleSet: { forbidden }, validate: true, ...baseOptions({ tsConfig: 'tsconfig.json' }) },
  {},
  { tsConfig: extractTSConfig('tsconfig.json') },
)
const violations = result.output.summary.violations.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`)

const expected = [
  'heavy-dep-heavy-lib: src/modules/collection/paginate.ts -> node_modules/heavy-lib/index.js',
  'index-stays-light: src/modules/collection/index.ts -> src/modules/collection/browser.ts',
  'inner-does-not-import-entry-points: src/modules/collection/paginate.ts -> src/workers/collect/index.ts',
  'no-circular: src/workers/collect/a.ts -> src/workers/collect/b.ts',
  'no-deep-imports-into-src-modules-catalog: src/workers/collect/index.ts -> src/modules/catalog/normalize.ts',
]

for (const violation of expected) {
  test(`baseRules reports ${violation}`, () => {
    assert.ok(violations.includes(violation), `got:\n  ${violations.join('\n  ')}`)
  })
}

test('baseRules reports nothing beyond the planted violations', () => {
  assert.deepEqual(violations.toSorted(), expected)
})
