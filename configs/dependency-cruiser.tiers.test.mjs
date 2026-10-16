import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { cruise } from 'dependency-cruiser'
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config'

const require = createRequire(import.meta.url)
const { baseRules, baseOptions } = require('./dependency-cruiser.cjs')

// Tiers: base and peer are tier 0, mid tier 1, top tier 2; stray is not listed.
// base <- mid <- top is the clean control. peer -> mid reaches up a tier, and
// mid -> peer would be a same-tier import; stray is imported by nobody and imports nothing.
const fixtures = fileURLToPath(new URL('./fixtures/depcruise-tiers/', import.meta.url))
process.chdir(fixtures)

async function violationsFor(moduleTiers, extra = {}) {
  const forbidden = baseRules({ moduleTiers, ...extra })
  const result = await cruise(
    ['src'],
    { ruleSet: { forbidden }, validate: true, ...baseOptions({ tsConfig: 'tsconfig.json' }) },
    {},
    { tsConfig: extractTSConfig('tsconfig.json') },
  )
  return result.output.summary.violations.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`).toSorted()
}

const tiers = { dir: 'src/modules', tiers: [['base', 'peer'], ['mid'], ['top']] }

test('moduleTiers reports an upward import and an unlisted module, and nothing for imports down the tiers', async () => {
  assert.deepEqual(await violationsFor(tiers), [
    'module-tier-peer: src/modules/peer/index.ts -> src/modules/mid/index.ts',
    'module-tier-unlisted: src/modules/stray/index.ts -> src/modules/base/index.ts',
  ])
})

test('moduleTiers reports a same-tier import between sibling modules', async () => {
  assert.deepEqual(await violationsFor({ dir: 'src/modules', tiers: [['base', 'peer', 'mid'], ['top']] }), [
    'module-tier-mid: src/modules/mid/index.ts -> src/modules/base/index.ts',
    'module-tier-peer: src/modules/peer/index.ts -> src/modules/mid/index.ts',
    'module-tier-unlisted: src/modules/stray/index.ts -> src/modules/base/index.ts',
  ].toSorted())
})

test('moduleTiers reports an import into a module that is not listed', async () => {
  const violations = await violationsFor({ dir: 'src/modules', tiers: [['peer'], ['mid'], ['top']] })
  assert.ok(violations.includes('module-tier-unlisted-target: src/modules/mid/index.ts -> src/modules/base/index.ts'), violations.join('\n'))
})

test('moduleTiers lets a process import any module while modules cannot import processes', async () => {
  const violations = await violationsFor(tiers, { inner: ['src/modules'], entryPoints: ['src/processes'] })
  assert.ok(!violations.some((v) => v.includes('src/processes/refresh.ts')), violations.join('\n'))
})

test('moduleTiers is off when no tiers are given', async () => {
  assert.deepEqual(await violationsFor(undefined), [])
})
