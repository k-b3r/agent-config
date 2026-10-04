#!/usr/bin/env node
// Repo checks for the `tool` rules of CODING_STANDARDS.md that no off-the-shelf
// linter fits. Run from the repo root: `repo-checks <command> [base-ref]`.
//   commits <base>           commit subjects in <base>..HEAD follow Version Control
//   escape-hatches <base>    eslint-disable / `as any` / @ts-expect-error count never grows (ratchet)
//   untested-modules <base>  no new source module without a sibling test (ratchet)
//   test-placement           unit tests sit next to their module; integration/e2e under tests/
//   entry-scripts            every entry file has a package.json script
//   test-db-env              integration/e2e code never reads the app's database env var
//   audit                    the repo wires every shared check (fails on what's missing)
//   all <base>               everything above
// Per-repo settings live in package.json "agentConfig" (see DEFAULTS).
// commitlint was skipped: its parser expects a `type:` prefix these repos don't use.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MAX_SUBJECT = 72
const DEFAULTS = {
  sourceDirs: ['src', 'server'],
  untestedExempt: [],
  escapeHatchExempt: ['tests/lint-fixtures/'],
  entries: [],
  appDbEnv: null,
}

// Unanchored: Claude Code's footer starts with an emoji, and hooks see the
// trailer inline in a `git commit -m` command. Shared with hooks/guard.mjs.
const ATTRIBUTION = /co-authored-by:[^\n]*\b(claude|anthropic)\b|generated with \[?claude/i

export const hasAiAttribution = (text) => ATTRIBUTION.test(text)

export function checkCommitMessage(message) {
  const subject = message.split('\n')[0]
  const problems = []
  if (!/^[a-z0-9]/.test(subject)) problems.push('subject must start lowercase')
  if (subject.endsWith('.')) problems.push('subject must not end with a period')
  if (subject.length > MAX_SUBJECT) problems.push(`subject must be at most ${MAX_SUBJECT} characters`)
  if (hasAiAttribution(message)) problems.push('no AI attribution (Co-Authored-By / Generated with)')
  return problems
}

const HATCHES = {
  'eslint-disable': /eslint-disable/g,
  'as any': /\bas any\b/g,
  '@ts-expect-error': /@ts-expect-error/g,
}

export function countEscapeHatches(fileContents) {
  const counts = Object.fromEntries(Object.keys(HATCHES).map((kind) => [kind, 0]))
  for (const text of fileContents) {
    for (const [kind, pattern] of Object.entries(HATCHES)) counts[kind] += text.match(pattern)?.length ?? 0
  }
  return counts
}

export function escapeHatchGrowth(base, head) {
  return Object.keys(base)
    .filter((kind) => head[kind] > base[kind])
    .map((kind) => `${kind}: ${base[kind]} -> ${head[kind]}`)
}

const isSource = (path) => /\.[cm]?tsx?$/.test(path) && !path.endsWith('.d.ts')
const isTest = (path) => /\.(test|spec)\.[cm]?tsx?$/.test(path)

// -z: without it git C-quotes non-ASCII paths, which then fail the extension filter and go uncounted.
export function sourcePaths(lsTreeZ, exemptPrefixes) {
  return lsTreeZ
    .split('\0')
    .filter((path) => isSource(path) && !exemptPrefixes.some((prefix) => path.startsWith(prefix)))
}

export function globToRegExp(glob) {
  let pattern = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (glob.startsWith('**/', i)) {
      pattern += '(?:.*/)?'
      i += 2
    } else if (glob.startsWith('**', i)) {
      pattern += '.*'
      i += 1
    } else if (char === '*') pattern += '[^/]*'
    else if (char === '{') pattern += '(?:'
    else if (char === '}') pattern += ')'
    else if (char === ',') pattern += '|'
    else pattern += char.replace(/[.+?^$()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${pattern}$`)
}

const matchesAny = (path, globs) => globs.some((glob) => globToRegExp(glob).test(path))
const withoutExtension = (path) => path.replace(/\.[cm]?tsx?$/, '')

export function untestedModules(paths, { sourceDirs, untestedExempt }) {
  const tested = new Set(paths.filter(isTest).map((path) => path.replace(/\.(test|spec)(\.[cm]?tsx?)$/, '')))
  return paths.filter(
    (path) =>
      sourceDirs.some((dir) => path.startsWith(`${dir}/`)) &&
      isSource(path) &&
      !isTest(path) &&
      !/(^|\/)index\.[cm]?tsx?$/.test(path) &&
      !matchesAny(path, untestedExempt) &&
      !tested.has(withoutExtension(path)),
  )
}

export function newlyUntested(baseUntested, headUntested) {
  const before = new Set(baseUntested)
  return headUntested.filter((path) => !before.has(path))
}

export function misplacedTests(paths) {
  const modules = new Set(paths.filter((path) => isSource(path) && !isTest(path)).map(withoutExtension))
  const problems = []
  for (const path of paths.filter(isTest)) {
    if (/\.int\.test\.[cm]?tsx?$/.test(path)) {
      if (!path.startsWith('tests/integration/')) problems.push(`${path}: integration tests live in tests/integration/`)
    } else if (/\.spec\.[cm]?tsx?$/.test(path)) {
      if (!path.startsWith('tests/e2e/')) problems.push(`${path}: e2e tests live in tests/e2e/`)
    } else if (!path.startsWith('tests/')) {
      const module = path.replace(/\.test(\.[cm]?tsx?)$/, '')
      if (!modules.has(module)) {
        const ext = path.match(/\.test(\.[cm]?tsx?)$/)[1]
        problems.push(`${path}: unit test has no sibling module (expected ${module}${ext})`)
      }
    }
  }
  return problems
}

export function entriesWithoutScript(paths, scripts, entryGlobs) {
  const commands = Object.values(scripts).join('\n')
  return paths
    .filter((path) => matchesAny(path, entryGlobs))
    .filter((path) => !commands.includes(path) && !commands.includes(path.replace(/\/index\.[cm]?tsx?$/, '')))
}

// Rough strip (ignores comment markers inside strings): good enough to let
// tests explain why they avoid the app's env var.
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

export function testDbEnvLeaks(files, appDbEnv) {
  // \b keeps TEST_DATABASE_URL from matching DATABASE_URL: `_` is a word character.
  const reads = new RegExp(`\\b${appDbEnv}\\b`)
  return files
    .filter(({ path }) => path.startsWith('tests/integration/') || path.startsWith('tests/e2e/'))
    .filter(({ text }) => reads.test(withoutComments(text)))
    .map(({ path }) => path)
}

const REQUIRED_SCRIPTS = ['check', 'lint', 'typecheck', 'test', 'format:check', 'depcruise', 'knip']

// repo: tracked path -> text ('' when the content isn't needed). Each finding names
// the CODING_STANDARDS.md section whose `tool` rule the missing piece enforces.
export function auditWiring(repo) {
  const paths = Object.keys(repo)
  const text = (path) => repo[path] ?? ''
  const has = (path) => path in repo
  const workflows = paths.filter((path) => path.startsWith('.github/workflows/')).map(text)
  const reviewCaller = workflows.find((wf) => wf.includes('k-b3r/agent-config/.github/workflows/pr-review.yml'))
  let pkg = {}
  try {
    pkg = JSON.parse(text('package.json') || '{}')
  } catch {
    // An unparseable package.json shows up as every script missing.
  }
  const scripts = pkg.scripts ?? {}
  const agentConfig = pkg.agentConfig ?? {}
  const trackedEnv = paths.filter((path) => /(^|\/)\.env(\.[^/]+)?$/.test(path) && !path.endsWith('.example'))

  const checks = [
    [has('CODING_STANDARDS.md'), 'Workflow: CODING_STANDARDS.md holds the project layer of the standards'],
    [text('CLAUDE.md').includes('CODING_STANDARDS.md'), 'Workflow: CLAUDE.md imports CODING_STANDARDS.md'],
    [
      /^## Architecture/m.test(text('CONTEXT.md')) || paths.some((path) => path.startsWith('docs/adr/')),
      'Architecture: CONTEXT.md "## Architecture" section or docs/adr/ records the fit check',
    ],
    [paths.some((path) => /(^|\/)\.env(\.[^/]+)?\.example$/.test(path)), 'Security: an .env.example is committed'],
    [/^\/?\.env/m.test(text('.gitignore')), 'Security: .gitignore ignores .env files'],
    [!trackedEnv.length, `Security: no .env file is tracked (found ${trackedEnv.join(', ')})`],
    [
      REQUIRED_SCRIPTS.every((name) => name in scripts),
      `Workflow: package.json has scripts ${REQUIRED_SCRIPTS.filter((name) => !(name in scripts)).join(', ')}`,
    ],
    [/pre-push:[\s\S]*pnpm check/.test(text('lefthook.yml')), 'Workflow: lefthook.yml runs pnpm check on pre-push'],
    [
      paths.some((path) => /^eslint\.config\.[cm]?[jt]s$/.test(path) && text(path).includes('@k-b3r/agent-config/eslint')),
      'Design: eslint config extends @k-b3r/agent-config/eslint',
    ],
    [
      text('.dependency-cruiser.cjs').includes('@k-b3r/agent-config/dependency-cruiser'),
      'Design: .dependency-cruiser.cjs extends @k-b3r/agent-config/dependency-cruiser',
    ],
    [paths.some((path) => /^knip\.(json|jsonc|ts|js)$/.test(path)), 'Refactoring: knip config finds dead code'],
    [
      workflows.some((wf) => wf.includes('k-b3r/agent-config/.github/workflows/ci-typescript.yml')),
      'Workflow: a CI workflow calls k-b3r/agent-config ci-typescript.yml',
    ],
    [Boolean(reviewCaller), 'Workflow: a workflow calls k-b3r/agent-config pr-review.yml'],
    [
      !reviewCaller || reviewCaller.includes('issue_comment'),
      'Workflow: pr-review caller triggers on issue_comment (for /approve)',
    ],
    [Boolean(agentConfig.appDbEnv), 'Testing: package.json agentConfig.appDbEnv names the app database env var'],
    [Boolean(agentConfig.entries?.length), 'Structure: package.json agentConfig.entries lists entry-file globs'],
  ]
  return checks.filter(([ok]) => !ok).map(([, finding]) => finding)
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

const trackedAt = (ref) => git('ls-tree', '-r', '-z', '--name-only', ref).split('\0').filter(Boolean)
const showAt = (ref, path) => git('show', `${ref}:${path}`)

function loadConfig() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  return { ...DEFAULTS, ...pkg.agentConfig, scripts: pkg.scripts ?? {} }
}

function report(name, problems, okMessage) {
  if (problems.length) console.error(`${name}:\n  ${problems.join('\n  ')}`)
  else console.log(`${name}: ${okMessage}`)
  return problems.length ? 1 : 0
}

const COMMANDS = {
  commits(base) {
    const shas = git('rev-list', '--no-merges', `${base}..HEAD`).split('\n').filter(Boolean)
    const problems = shas.flatMap((sha) => {
      const found = checkCommitMessage(git('log', '-1', '--format=%B', sha))
      return found.length ? [`${sha.slice(0, 7)} ${git('log', '-1', '--format=%s', sha).trim()}: ${found.join('; ')}`] : []
    })
    return report('commits', problems, `${shas.length} ok`)
  },
  'escape-hatches'(base, config) {
    const count = (ref) =>
      countEscapeHatches(sourcePaths(trackedAt(ref).join('\0'), config.escapeHatchExempt).map((p) => showAt(ref, p)))
    return report('escape-hatches', escapeHatchGrowth(count(base), count('HEAD')), `did not grow versus ${base}`)
  },
  'untested-modules'(base, config) {
    const added = newlyUntested(untestedModules(trackedAt(base), config), untestedModules(trackedAt('HEAD'), config))
    return report('untested-modules', added.map((p) => `${p}: add a sibling test`), `none added versus ${base}`)
  },
  'test-placement'() {
    return report('test-placement', misplacedTests(trackedAt('HEAD')), 'ok')
  },
  'entry-scripts'(_base, config) {
    const missing = entriesWithoutScript(trackedAt('HEAD'), config.scripts, config.entries)
    return report('entry-scripts', missing.map((p) => `${p}: add a package.json script`), 'ok')
  },
  'test-db-env'(_base, config) {
    if (!config.appDbEnv) return report('test-db-env', [], 'skipped (no agentConfig.appDbEnv)')
    const files = trackedAt('HEAD')
      .filter((path) => isSource(path) && path.startsWith('tests/'))
      .map((path) => ({ path, text: showAt('HEAD', path) }))
    const leaks = testDbEnvLeaks(files, config.appDbEnv)
    return report('test-db-env', leaks.map((p) => `${p}: use the test-only database env var`), 'ok')
  },
  audit() {
    const WANTED = /(^|\/)(CLAUDE|CONTEXT)\.md$|^\.gitignore$|^lefthook\.yml$|^eslint\.config\.|^\.dependency-cruiser\.cjs$|^package\.json$|^\.github\/workflows\//
    const repo = Object.fromEntries(
      trackedAt('HEAD').map((path) => [path, WANTED.test(path) ? readFileSync(path, 'utf8') : '']),
    )
    return report('audit', auditWiring(repo), 'every shared check is wired')
  },
}

const NEEDS_BASE = new Set(['commits', 'escape-hatches', 'untested-modules', 'all'])

function main([command, base]) {
  if (!(command in COMMANDS) && command !== 'all') {
    console.error(`usage: repo-checks <${[...Object.keys(COMMANDS), 'all'].join('|')}> [base-ref]`)
    return 2
  }
  if (NEEDS_BASE.has(command) && !base) {
    console.error(`repo-checks ${command} needs a base ref, e.g. origin/main`)
    return 2
  }
  const config = loadConfig()
  const run = command === 'all' ? Object.keys(COMMANDS) : [command]
  // Run every check even after a failure, so one run reports them all.
  return run.map((name) => COMMANDS[name](base, config)).some(Boolean) ? 1 : 0
}

// realpath: package managers expose the bin through a symlink.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
