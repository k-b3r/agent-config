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
    defaultExportAllowed: ['tests/integration/global-setup.ts'],
    parameterizedSqlFiles: ['src/domain/**'],
    noConsoleFiles: ['src/domain/**'],
    pureCorePaths: ['src/core/**'],
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
  ['src/domain/interpolated-sql.ts', 'agent-config/no-interpolated-sql'],
  ['src/domain/console-log.ts', 'no-console'],
  ['src/core/new-date.ts', 'no-restricted-syntax'],
  ['src/core/date-now.ts', 'no-restricted-syntax'],
  ['src/core/math-random.ts', 'no-restricted-syntax'],
  ['src/core/fetch.ts', 'no-restricted-globals'],
  ['src/core/process.ts', 'no-restricted-globals'],
]

for (const [file, rule] of violations) {
  test(`baseConfig flags ${file} with ${rule}`, async () => {
    assert.ok((await errors(file)).includes(rule), `expected ${rule}`)
  })
}

test('baseConfig ignores the sandbox copies a mutation run leaves behind', async () => {
  assert.equal(await eslint.isPathIgnored(join(fixtures, '.stryker-tmp/0/src/clean.ts')), true)
})

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

test('baseConfig lets tool config files read process.env', async () => {
  assert.deepEqual(await errors('env.config.ts'), [])
})

test('baseConfig lets defaultExportAllowed override the test-file rules', async () => {
  assert.deepEqual(await errors('tests/integration/global-setup.ts'), [])
})

test('baseConfig lets CommonJS config files use require', async () => {
  assert.deepEqual(await errors('tool.cjs'), [])
})

test('baseConfig reports long parameter lists as a warning, not an error', async () => {
  assert.deepEqual(await lint('src/many-params.ts'), [{ rule: 'max-params', severity: 'warn' }])
})

test('baseConfig lets SQL interpolate a constant fragment while values stay parameters', async () => {
  assert.deepEqual(await errors('src/domain/safe-sql.ts'), [])
})

test('baseConfig leaves SQL and console alone outside the opted-in domain files', async () => {
  assert.deepEqual(await errors('src/entry.ts'), [])
})

test('baseConfig tells pure code to take the clock and randomness as arguments', async () => {
  const messageOf = async (file) => {
    const [result] = await eslint.lintFiles([join(fixtures, file)])
    return result.messages.map((m) => m.message).join('\n')
  }
  assert.match(await messageOf('src/core/new-date.ts'), /Pass `now` in/)
  assert.match(await messageOf('src/core/date-now.ts'), /Pass `now` in/)
  assert.match(await messageOf('src/core/math-random.ts'), /randomness/)
})

test('baseConfig lets pure code build dates from arguments', async () => {
  assert.deepEqual(await lint('src/core/clean.ts'), [])
})

test('baseConfig leaves clock, randomness and fetch alone outside the opted-in pure core', async () => {
  assert.deepEqual(await errors('src/entry.ts'), [])
})
