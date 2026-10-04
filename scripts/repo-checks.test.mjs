import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  auditWiring,
  checkCommitMessage,
  countEscapeHatches,
  entriesWithoutScript,
  escapeHatchGrowth,
  globToRegExp,
  misplacedTests,
  newlyUntested,
  sourcePaths,
  testDbEnvLeaks,
  untestedModules,
} from './repo-checks.mjs'

test('checkCommitMessage accepts an imperative lowercase subject and the merge <branch> style', () => {
  assert.deepEqual(checkCommitMessage('add real estate page'), [])
  assert.deepEqual(checkCommitMessage('merge standards-and-test-setup'), [])
})

test('checkCommitMessage flags capitalized, trailing-period and overlong subjects', () => {
  assert.ok(checkCommitMessage('Add page').includes('subject must start lowercase'))
  assert.ok(checkCommitMessage('add page.').includes('subject must not end with a period'))
  assert.ok(checkCommitMessage('add ' + 'x'.repeat(70)).includes('subject must be at most 72 characters'))
})

test('checkCommitMessage flags AI attribution, including the emoji-prefixed footer', () => {
  const problem = 'no AI attribution (Co-Authored-By / Generated with)'
  assert.ok(checkCommitMessage('add page\n\nCo-Authored-By: Claude <noreply@anthropic.com>').includes(problem))
  assert.ok(checkCommitMessage('add page\n\n🤖 Generated with [Claude Code](https://claude.com)').includes(problem))
  assert.deepEqual(checkCommitMessage('regenerate docs\n\nFiles generated with gen-arch-doc'), [])
})

test('countEscapeHatches counts each kind and escapeHatchGrowth reports only kinds that grew', () => {
  const counts = countEscapeHatches(['const a = b as any\n// eslint-disable-next-line x -- y', '// @ts-expect-error -- z'])
  assert.deepEqual(counts, { 'eslint-disable': 1, 'as any': 1, '@ts-expect-error': 1 })
  assert.deepEqual(escapeHatchGrowth(counts, { ...counts, 'as any': 2 }), ['as any: 1 -> 2'])
})

test('sourcePaths keeps non-ASCII TS paths from NUL-separated ls-tree output and drops exempt prefixes', () => {
  const listing = ['src/café.ts', 'src/a.tsx', 'README.md', 'tests/lint-fixtures/any.ts', ''].join('\0')
  assert.deepEqual(sourcePaths(listing, ['tests/lint-fixtures/']), ['src/café.ts', 'src/a.tsx'])
})

test('globToRegExp supports *, ** and {a,b}', () => {
  assert.ok(globToRegExp('src/workers/*/index.ts').test('src/workers/collect/index.ts'))
  assert.ok(!globToRegExp('src/workers/*/index.ts').test('src/workers/a/b/index.ts'))
  assert.ok(globToRegExp('scripts/**/*.{ts,mjs}').test('scripts/deep/x.mjs'))
  assert.ok(globToRegExp('scripts/**/*.{ts,mjs}').test('scripts/x.ts'))
})

test('untestedModules lists source files without a sibling test, skipping barrels, types and exempt globs', () => {
  const paths = [
    'src/a.ts',
    'src/a.test.ts',
    'src/b.ts',
    'src/index.ts',
    'src/types.d.ts',
    'src/gen/schema.ts',
    'server/c.tsx',
    'dashboard/page.tsx',
  ]
  assert.deepEqual(untestedModules(paths, { sourceDirs: ['src', 'server'], untestedExempt: ['src/gen/**'] }), [
    'src/b.ts',
    'server/c.tsx',
  ])
})

test('newlyUntested reports untested modules that were not untested at base', () => {
  assert.deepEqual(newlyUntested(['src/old.ts'], ['src/old.ts', 'src/new.ts']), ['src/new.ts'])
})

test('misplacedTests flags orphan unit tests and integration/e2e tests outside tests/', () => {
  const paths = [
    'src/a.ts',
    'src/a.test.ts',
    'src/gone.test.ts',
    'src/db.int.test.ts',
    'tests/integration/db.int.test.ts',
    'tests/e2e/login.spec.ts',
    'src/login.spec.ts',
    'tests/lint-config.test.ts',
  ]
  assert.deepEqual(misplacedTests(paths), [
    'src/gone.test.ts: unit test has no sibling module (expected src/gone.ts)',
    'src/db.int.test.ts: integration tests live in tests/integration/',
    'src/login.spec.ts: e2e tests live in tests/e2e/',
  ])
})

test('entriesWithoutScript lists entry files no package.json script mentions', () => {
  const paths = ['src/workers/collect/index.ts', 'src/workers/price/index.ts', 'src/workers/price/run.ts']
  const scripts = { collect: 'tsx src/workers/collect/index.ts' }
  assert.deepEqual(entriesWithoutScript(paths, scripts, ['src/workers/*/index.ts']), ['src/workers/price/index.ts'])
})

test('entriesWithoutScript accepts a script that names the entry folder', () => {
  const scripts = { collect: 'tsx src/workers/collect' }
  assert.deepEqual(entriesWithoutScript(['src/workers/collect/index.ts'], scripts, ['src/workers/*/index.ts']), [])
})

test('testDbEnvLeaks flags integration and e2e code that reads the app database env var', () => {
  const files = [
    { path: 'tests/integration/setup.ts', text: 'const url = process.env.TEST_DATABASE_URL' },
    { path: 'tests/e2e/env.ts', text: 'const url = process.env.DATABASE_URL' },
    { path: 'src/storage.ts', text: 'process.env.DATABASE_URL' },
  ]
  assert.deepEqual(testDbEnvLeaks(files, 'DATABASE_URL'), ['tests/e2e/env.ts'])
})

const wiredRepo = {
  'CODING_STANDARDS.md': '# Coding Standards',
  'CLAUDE.md': '@CODING_STANDARDS.md',
  'CONTEXT.md': '## Architecture\n\nDecision: modular monolith',
  '.env.example': 'DATABASE_URL=',
  '.gitignore': 'node_modules\n.env*\n!.env.example',
  'lefthook.yml': 'pre-push:\n  jobs:\n    - run: pnpm check',
  'eslint.config.js': "import { baseConfig } from '@k-b3r/agent-config/eslint'",
  '.dependency-cruiser.cjs': "require('@k-b3r/agent-config/dependency-cruiser')",
  'knip.json': '{}',
  '.github/workflows/ci.yml': 'uses: k-b3r/agent-config/.github/workflows/ci-typescript.yml@main',
  '.github/workflows/pr-review.yml':
    'on:\n  issue_comment:\njobs:\n  review:\n    uses: k-b3r/agent-config/.github/workflows/pr-review.yml@main',
  'package.json': JSON.stringify({
    scripts: { check: '', lint: '', typecheck: '', test: '', 'format:check': '', depcruise: '', knip: '' },
    devDependencies: { '@k-b3r/agent-config': 'github:k-b3r/agent-config' },
    agentConfig: { appDbEnv: 'DATABASE_URL', entries: ['src/workers/*/index.ts'] },
  }),
}

test('testDbEnvLeaks ignores the app env var named only in comments', () => {
  const files = [
    { path: 'tests/integration/setup.ts', text: '// Deliberately not DATABASE_URL: it points at prod\nconst u = 1' },
    { path: 'tests/e2e/env.ts', text: '/* not DATABASE_URL\n   either */ export {}' },
  ]
  assert.deepEqual(testDbEnvLeaks(files, 'DATABASE_URL'), [])
})

test('auditWiring passes a fully wired repo', () => {
  assert.deepEqual(auditWiring(wiredRepo), [])
})

test('auditWiring names each missing piece and the rule it enforces', () => {
  const { 'lefthook.yml': _, 'CONTEXT.md': __, ...repo } = wiredRepo
  repo['.env'] = 'SECRET=1'
  assert.deepEqual(auditWiring(repo), [
    'Architecture: CONTEXT.md "## Architecture" section or docs/adr/ records the fit check',
    'Security: no .env file is tracked (found .env)',
    'Workflow: lefthook.yml runs pnpm check on pre-push',
  ])
})

test('auditWiring accepts env templates like .env.local.example', () => {
  assert.deepEqual(auditWiring({ ...wiredRepo, 'dashboard/.env.local.example': 'API_URL=' }), [])
})

test('auditWiring flags a review caller that cannot take /approve comments', () => {
  const repo = { ...wiredRepo, '.github/workflows/pr-review.yml': 'uses: k-b3r/agent-config/.github/workflows/pr-review.yml@main' }
  assert.deepEqual(auditWiring(repo), ['Workflow: pr-review caller triggers on issue_comment (for /approve)'])
})
