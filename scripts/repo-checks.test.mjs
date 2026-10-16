import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  auditWiring,
  checkCommitMessage,
  countEscapeHatches,
  diffSize,
  entriesWithoutScript,
  escapeHatchGrowth,
  globToRegExp,
  misplacedTests,
  movedLinesByFile,
  newlyUntested,
  parseNumstat,
  sourcePaths,
  testDbEnvLeaks,
  writeAllWorkflows,
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
  'lefthook.yml':
    'pre-push:\n  jobs:\n    - run: pnpm check\ncommit-msg:\n  jobs:\n    - run: pnpm exec repo-checks commit-msg {1}',
  'eslint.config.js': "import { baseConfig } from '@k-b3r/agent-config/eslint'",
  '.dependency-cruiser.cjs': "require('@k-b3r/agent-config/dependency-cruiser')",
  'knip.json': '{}',
  '.github/pull_request_template.md': '## Intent',
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
    'Version Control: lefthook.yml runs repo-checks commit-msg on commit-msg',
  ])
})

test('auditWiring flags a repo without a pull request template', () => {
  const { '.github/pull_request_template.md': _, ...repo } = wiredRepo
  assert.deepEqual(auditWiring(repo), ['Workflow: .github/pull_request_template.md gives PR bodies their sections'])
})

test('auditWiring accepts the template in docs/ or the repo root', () => {
  const { '.github/pull_request_template.md': _, ...repo } = wiredRepo
  assert.deepEqual(auditWiring({ ...repo, 'docs/pull_request_template.md': '' }), [])
})

test('auditWiring accepts env templates like .env.local.example', () => {
  assert.deepEqual(auditWiring({ ...wiredRepo, 'dashboard/.env.local.example': 'API_URL=' }), [])
})

test('auditWiring flags a review caller that cannot take /approve comments', () => {
  const repo = { ...wiredRepo, '.github/workflows/pr-review.yml': 'uses: k-b3r/agent-config/.github/workflows/pr-review.yml@main' }
  assert.deepEqual(auditWiring(repo), ['Workflow: pr-review caller triggers on issue_comment (for /approve)'])
})

test('writeAllWorkflows flags a workflow that grants write-all and ignores commented or scoped permissions', () => {
  const files = [
    { path: '.github/workflows/ci.yml', text: 'name: ci\npermissions: write-all\njobs: {}\n' },
    { path: '.github/workflows/ok.yml', text: 'permissions:\n  contents: read\n' },
    { path: '.github/workflows/note.yml', text: '# permissions: write-all was too broad\npermissions:\n  contents: read\n' },
    { path: 'docs/ci.yml', text: 'permissions: write-all\n' },
  ]
  assert.deepEqual(writeAllWorkflows(files), ['.github/workflows/ci.yml'])
})

const numstat = (...rows) => rows.join('\0') + '\0'

test('parseNumstat reads added and deleted counts, takes the new path of a rename, and counts binary files as 0', () => {
  const output = numstat('10\t2\tsrc/a.ts', '-\t-\tlogo.png', '0\t0\t', 'src/old.ts', 'src/new.ts')
  assert.deepEqual(parseNumstat(output), [
    { path: 'src/a.ts', changed: 12 },
    { path: 'logo.png', changed: 0 },
    { path: 'src/new.ts', changed: 0 },
  ])
})

test('diffSize sums added and deleted lines, skipping lockfiles and generated paths', () => {
  const entries = [
    { path: 'src/a.ts', changed: 120 },
    { path: 'src/a.test.ts', changed: 80 },
    { path: 'pnpm-lock.yaml', changed: 900 },
    { path: 'drizzle/0001_init.sql', changed: 300 },
  ]
  const size = diffSize(entries, { generatedPaths: ['drizzle/**'], maxDiffLines: 500 })
  assert.equal(size.lines, 200)
  assert.deepEqual(size.largest, ['src/a.ts (120)', 'src/a.test.ts (80)'])
})

test('diffSize names the three largest files so the split is easy to plan', () => {
  const entries = ['a', 'b', 'c', 'd'].map((name, i) => ({ path: `src/${name}.ts`, changed: (i + 1) * 10 }))
  assert.deepEqual(diffSize(entries, { generatedPaths: [], maxDiffLines: 5 }).largest, [
    'src/d.ts (40)',
    'src/c.ts (30)',
    'src/b.ts (20)',
  ])
})

const ESC = String.fromCharCode(27)
const colored = (code, text) => `${ESC}[${code}m${text}${ESC}[m`

test('movedLinesByFile counts lines git colored as moved, per file, and ignores plain and header lines', () => {
  const patch = [
    colored('1', 'diff --git src/a.ts src/a.ts'),
    colored('1', '--- src/a.ts'),
    colored('1', '+++ src/a.ts'),
    colored('36', '@@ -1,3 +0,0 @@'),
    colored('1;35', '-moved one'),
    colored('1;35', '-moved two'),
    colored('31', '-really gone'),
    colored('1', 'diff --git src/b.ts src/b.ts'),
    colored('1', '--- /dev/null'),
    colored('1', '+++ src/b.ts'),
    colored('1;36', '+moved one'),
    colored('1;36', '+moved two'),
    colored('32', '+brand new'),
  ].join('\n')
  assert.deepEqual([...movedLinesByFile(patch)], [['src/a.ts', 2], ['src/b.ts', 2]])
})

test('movedLinesByFile credits a deleted file, and keeps names with spaces', () => {
  const patch = [
    colored('1', '--- docs/old notes.md\t'),
    colored('1', '+++ /dev/null'),
    colored('1;35', '-moved'),
  ].join('\n')
  assert.deepEqual([...movedLinesByFile(patch)], [['docs/old notes.md', 1]])
})

test('diffSize leaves moved lines out of a file and out of the largest-file list', () => {
  const entries = [
    { path: 'src/store.ts', changed: 300 },
    { path: 'src/old.ts', changed: 280 },
  ]
  const moved = new Map([['src/store.ts', 250], ['src/old.ts', 260]])
  const size = diffSize(entries, { generatedPaths: [] }, moved)
  assert.equal(size.lines, 70)
  assert.deepEqual(size.largest, ['src/store.ts (50)', 'src/old.ts (20)'])
})

// End to end through git: a block moved between files must not count, new code must.
function diffSizeIn(repo, base) {
  const script = fileURLToPath(new URL('./repo-checks.mjs', import.meta.url))
  try {
    return { code: 0, out: execFileSync('node', [script, 'diff-size', base], { cwd: repo, encoding: 'utf8' }) }
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` }
  }
}

function repoWithMove(extraNewLines) {
  const repo = mkdtempSync(join(tmpdir(), 'diff-size-'))
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' })
  const block = Array.from({ length: 60 }, (_, i) => `export const value${i} = computeSomething(${i}, 'label-${i}')`)
  mkdirSync(join(repo, 'src'))
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ agentConfig: { maxDiffLines: 50 } }))
  writeFileSync(join(repo, 'src/a.ts'), `${block.join('\n')}\n`)
  git('init', '-q', '-b', 'main')
  git('add', '-A')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(join(repo, 'src/a.ts'), 'export {}\n')
  const added = Array.from({ length: extraNewLines }, (_, i) => `export const extra${i} = brandNewBehavior(${i})`)
  writeFileSync(join(repo, 'src/b.ts'), `${[...block, ...added].join('\n')}\n`)
  git('add', '-A')
  git('commit', '-qm', 'move block')
  return repo
}

test('repo-checks diff-size passes a PR that only moves a block between files, however big the move', () => {
  const { code, out } = diffSizeIn(repoWithMove(0), 'main')
  assert.equal(code, 0, out)
  assert.match(out, /moved/)
})

test('repo-checks diff-size still fails once new lines beyond the limit ride along with the move', () => {
  const { code, out } = diffSizeIn(repoWithMove(60), 'main')
  assert.equal(code, 1, out)
  assert.match(out, /limit 50/)
})
