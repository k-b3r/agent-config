import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { baseConfig } from './eslint.mjs'

// One deliberately violating fixture per rule plus a clean control, so a
// mis-scoped glob or a dropped rule fails here instead of silently checking nothing.
const fixtures = fileURLToPath(new URL('./fixtures/eslint/', import.meta.url))

const eslint = new ESLint({
  cwd: fixtures,
  overrideConfigFile: true,
  overrideConfig: baseConfig({
    tsconfigRootDir: fixtures,
    entryPoints: ['src/entry.ts'],
    delayModules: ['src/delay.ts'],
  }),
})

async function lint(file) {
  const [result] = await eslint.lintFiles([join(fixtures, file)])
  return result.messages.map((m) => ({ rule: m.ruleId ?? 'parse-error', severity: m.severity === 2 ? 'error' : 'warn' }))
}

const errors = async (file) => (await lint(file)).filter((m) => m.severity === 'error').map((m) => m.rule)

const violations = [
  ['src/ts-ignore.ts', '@typescript-eslint/ban-ts-comment'],
  ['src/export-all.ts', 'no-restricted-syntax'],
  ['src/default-export.ts', 'no-restricted-syntax'],
  ['src/explicit-any.ts', '@typescript-eslint/no-explicit-any'],
  ['src/undescribed-disable.ts', '@eslint-community/eslint-comments/require-description'],
  ['src/unlimited-disable.ts', '@eslint-community/eslint-comments/no-unlimited-disable'],
  ['src/ambient-env.ts', 'no-restricted-properties'],
  ['src/inline-sleep.ts', 'no-restricted-syntax'],
  ['src/floating-promise.ts', '@typescript-eslint/no-floating-promises'],
  ['src/value-type-import.ts', '@typescript-eslint/consistent-type-imports'],
]

for (const [file, rule] of violations) {
  test(`baseConfig flags ${file} with ${rule}`, async () => {
    assert.ok((await errors(file)).includes(rule), `expected ${rule}`)
  })
}

test('baseConfig passes the clean control fixture', async () => {
  assert.deepEqual(await lint('src/clean.ts'), [])
})

test('baseConfig lets entry points read process.env', async () => {
  assert.deepEqual(await errors('src/entry.ts'), [])
})

test('baseConfig lets the delay module sleep with setTimeout', async () => {
  assert.deepEqual(await errors('src/delay.ts'), [])
})

test('baseConfig lets tests sleep and read env', async () => {
  assert.deepEqual(await errors('tests/sleep.test.ts'), [])
})

test('baseConfig allows a default export in tool config files', async () => {
  assert.deepEqual(await errors('tool.config.ts'), [])
})

test('baseConfig lets CommonJS config files use require', async () => {
  assert.deepEqual(await errors('tool.cjs'), [])
})

test('baseConfig reports long parameter lists as a warning, not an error', async () => {
  assert.deepEqual(await lint('src/many-params.ts'), [{ rule: 'max-params', severity: 'warn' }])
})
