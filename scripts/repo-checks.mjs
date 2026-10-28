#!/usr/bin/env node
// Repo checks for the `tool` rules of CODING_STANDARDS.md that no off-the-shelf
// linter fits. Run from the repo root: `repo-checks <command> [base-ref]`.
//   commits <base>           commit subjects in <base>..HEAD follow Version Control
//   commit-msg <file>        the message being committed follows it (lefthook commit-msg; not in `all`)
//   escape-hatches <base>    eslint-disable / `as any` / @ts-expect-error count never grows (ratchet)
//   untested-modules <base>  no new source module without a sibling test (ratchet; a file
//                            named types.ts holds types only, so it is exempt by default)
//   test-placement           unit tests sit next to their module; integration/e2e under tests/
//   entry-scripts            every entry file has a package.json script
//   test-db-env              integration/e2e code never reads the app's database env var
//   review-tier <base>       prints `claude` when the PR touches an irreversible write, a migration,
//                            a deleted file or the business-logic paths (`agentConfig.claudeReviewPaths`),
//                            `deepseek` otherwise (which reviewer to run; not in `all`)
//   workflow-permissions     no workflow grants `permissions: write-all` (least-privilege tokens)
//   diff-size <base>         the PR changes at most maxDiffLines lines outside lockfiles, generatedPaths and
//                            moved blocks (override: env ALLOW_LARGE_DIFF=true, CI sets it from label
//                            large-diff-approved)
//   contracts-unmodified <base>  contract tests (*.contract.test.*) are only added, never changed or deleted
//                            (override: env ALLOW_CONTRACT_CHANGES=true, CI sets it from label contract-change-approved)
//   skip-only <base>         no added line in a test file skips or isolates a test (.skip(, .only(, xit(, xdescribe(;
//                            it.todo passes); patterns: agentConfig.skipPatterns
//   mutation-targets <base>  prints the changed source files under agentConfig.mutationPaths (not in `all`;
//                            input for the mutation report job)
//   audit                    the repo wires every shared check (fails on what's missing)
//   all <base>               everything above
// Per-repo settings live in package.json "agentConfig" (see DEFAULTS).
// commitlint was skipped: its parser expects a `type:` prefix these repos don't use.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_SUBJECT = 72
// Measured 2026-10-14 on k-b3r/buy-and-sell (40 merged PRs, median 266 lines): 15 PRs
// passed 500 and 10 passed 800. With moved blocks not counted, 15 became 10 and 10
// became 6 (4 features, 2 layout refactors), all large enough to want slicing.
const MAX_DIFF_LINES = 800
const DIFF_LARGEST_SHOWN = 3
// A module keeps its shared types in `types.ts`, a file with no runtime code, so no
// sibling test is expected (CODING_STANDARDS.md, Testing). A repo cannot switch the
// exemption off; `untestedExempt` only adds globs to it.
const TYPES_ONLY_EXEMPT = ['**/types.ts']
// The reviewers' split (README, "Review tier"): a cheap model reviews most PRs, Claude reviews what a
// mistake would make hard to undo. These are the paths it gets; a repo overrides them in `agentConfig`.
const CLAUDE_TIER = 'claude'
const DEEPSEEK_TIER = 'deepseek'
const DEFAULT_CLAUDE_REVIEW_PATHS = ['src/modules/*/domain/**', 'src/modules/*/store.ts']
const DEFAULT_MIGRATION_PATHS = ['**/migrations/**', '**/migration/**', 'drizzle/**', 'prisma/**', '**/*.sql']
// SQL that destroys or rewrites stored data, in the forms a line of code uses. Qualified on purpose:
// a bare /update/ would match "update the docs" and send every PR to the dear reviewer. A test or doc
// that quotes these words is not an irreversible write, so those paths are skipped in `reviewTier`.
const DESTRUCTIVE_SQL =
  /\bdelete\s+from\b|\bupdate\s+[\w.]+\s+set\b|\balter\s+table\b|\bdrop\s+(?:table|schema|index|view|column|database|type|constraint)\b|\btruncate\s+(?:table\s+)?[\w.]+/i
const RISK_BOX = /\b(?:money|payment|pricing|billing|auth|permission|credentials?|secrets?|user data|personal data|migration|deletes? data|infra|deployment)\b/i

const DEFAULTS = {
  sourceDirs: ['src', 'server'],
  untestedExempt: TYPES_ONLY_EXEMPT,
  escapeHatchExempt: ['tests/lint-fixtures/'],
  entries: [],
  appDbEnv: null,
  maxDiffLines: MAX_DIFF_LINES,
  generatedPaths: [],
  mutationPaths: [],
  claudeReviewPaths: DEFAULT_CLAUDE_REVIEW_PATHS,
  migrationPaths: DEFAULT_MIGRATION_PATHS,
  skipPatterns: ['\\.skip\\(', '\\.only\\(', '\\bxit\\(', '\\bxdescribe\\('],
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

// Only `commits` prints this: commit-msg runs before the commit exists, so there is nothing to reword yet.
const REWORD_HINT =
  'hint: reword the commit (git commit --amend or interactive rebase, then push --force-with-lease) or squash the PR; web-editor commits default to capitalized subjects'

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
// Written blind from the stubs and contract before the implementation (see /spike-and-rebuild).
const isContractTest = (path) => /\.contract\.test\.[cm]?tsx?$/.test(path)
const testTarget = (path) => path.replace(/(\.contract)?\.(test|spec)(\.[cm]?tsx?)$/, '')

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
  const exempt = [...TYPES_ONLY_EXEMPT, ...(untestedExempt ?? [])]
  const tested = new Set(paths.filter(isTest).map(testTarget))
  return paths.filter(
    (path) =>
      sourceDirs.some((dir) => path.startsWith(`${dir}/`)) &&
      isSource(path) &&
      !isTest(path) &&
      !/(^|\/)index\.[cm]?tsx?$/.test(path) &&
      !matchesAny(path, exempt) &&
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
      const module = path.replace(/(\.contract)?\.test(\.[cm]?tsx?)$/, '')
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

// The added lines of a `git diff -U0 --no-prefix` patch, as { path, text }.
export function addedLines(patch) {
  const lines = []
  let path = null
  for (const row of patch.split('\n')) {
    if (row.startsWith('+++ ')) path = row.slice(4).replace(/\t$/, '')
    else if (row.startsWith('--- ')) continue
    else if (row.startsWith('+') && path && path !== '/dev/null') lines.push({ path, text: row.slice(1) })
  }
  return lines
}

// The risk boxes a PR body ticked (`- [x] Touches money`), which can only escalate a PR to the dear reviewer.
export function tickedRiskBoxes(body) {
  return body
    .split('\n')
    .map((line) => line.match(/^\s*[-*]\s+\[x\]\s+(.*)$/i)?.[1]?.trim())
    .filter((text) => text && RISK_BOX.test(text))
}

// Which reviewer a PR needs. Deterministic on purpose: a cheap model never decides whether a PR is risky
// enough for the dear one, and a PR body can escalate but never downgrade (it is the author's text).
// files: parseNameStatus output; addedLines: addedLines(patch); labels: PR labels; body: PR body.
export function reviewTier({ files, addedLines: added = [], labels = [], body = '', config = {} }) {
  const claudePaths = config.claudeReviewPaths ?? DEFAULT_CLAUDE_REVIEW_PATHS
  const migrationPaths = config.migrationPaths ?? DEFAULT_MIGRATION_PATHS
  const reasons = new Set()
  for (const { status, paths } of files) {
    const [oldPath, newPath] = paths
    if (status === 'D') {
      reasons.add(`deletes ${oldPath}`)
      continue
    }
    for (const path of paths) {
      if (matchesAny(path, migrationPaths)) reasons.add(`migration ${path}`)
      if (matchesAny(path, claudePaths)) reasons.add(`business logic ${path}`)
    }
    if (status === 'R' && matchesAny(newPath, claudePaths)) reasons.add(`business logic ${newPath}`)
  }
  for (const { path, text } of added) {
    if (isTest(path) || /\.(?:md|json|snap)$/.test(path)) continue
    if (DESTRUCTIVE_SQL.test(text)) reasons.add(`irreversible write in ${path}`)
  }
  for (const box of tickedRiskBoxes(body)) reasons.add(`PR body box: ${box}`)
  if (labels.includes('review-opus')) reasons.add('label review-opus')
  return { tier: reasons.size ? CLAUDE_TIER : DEEPSEEK_TIER, reasons: [...reasons] }
}

// files: { path, text } of tracked workflow files. `write-all` hands every token
// scope to code that runs on pull requests; name the scopes a job needs instead.
export function writeAllWorkflows(files) {
  return files
    .filter(({ path }) => /^\.github\/workflows\/.+\.ya?ml$/.test(path))
    .filter(({ text }) => /^\s*permissions:\s*write-all\b/m.test(withoutHashComments(text)))
    .map(({ path }) => path)
}

const withoutHashComments = (text) => text.replace(/#.*$/gm, '')

const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'uv.lock', 'go.sum'])

// `git diff --numstat -z`: "added\tdeleted\tpath\0", or for a rename
// "added\tdeleted\t\0old\0new\0". Binary files report "-" and count as 0.
export function parseNumstat(numstatZ) {
  const tokens = numstatZ.split('\0')
  const entries = []
  for (let i = 0; i < tokens.length; i++) {
    const row = tokens[i].match(/^(\d+|-)\t(\d+|-)\t(.*)$/)
    if (!row) continue
    const [, added, deleted, path] = row
    if (path === '') i += 2
    entries.push({ path: path === '' ? tokens[i] : path, changed: (Number(added) || 0) + (Number(deleted) || 0) })
  }
  return entries
}

const ESC = String.fromCharCode(27)
const ANSI_LINE = new RegExp(`^${ESC}\\[([0-9;]*)m(.*)$`)
const ANSI_CODE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
// Colors the patch is requested with (see GIT_DIFF_COLORS): plain added/removed lines
// are 32/31 and file headers are exactly 1; any other +/- line is part of a moved block.
const COLOR_ADDED = '32'
const COLOR_REMOVED = '31'
const COLOR_HEADER = '1'

// Lines per file that `git diff --color-moved` shows as moved: they were removed in one
// place and added in another, so a reviewer reads them once, not twice.
export function movedLinesByFile(coloredPatch) {
  const moved = new Map()
  let current = null
  for (const raw of coloredPatch.split('\n')) {
    const match = raw.match(ANSI_LINE)
    if (!match) continue
    const [, code, rest] = match
    const text = rest.replace(ANSI_CODE, '')
    if (code === COLOR_HEADER) {
      // A deleted file's `+++` is /dev/null, so its path comes from the `---` line.
      // Git appends a tab to names with spaces.
      const path = text.replace(/^(---|\+\+\+) /, '').replace(/\t$/, '')
      if (/^(---|\+\+\+) /.test(text) && path !== '/dev/null') current = path
      continue
    }
    if (code === COLOR_ADDED || code === COLOR_REMOVED || !/^[+-]/.test(text) || current === null) continue
    moved.set(current, (moved.get(current) ?? 0) + 1)
  }
  return moved
}

export function diffSize(entries, { generatedPaths }, moved = new Map()) {
  const counted = entries
    .filter(({ path }) => !LOCKFILES.has(basename(path)) && !matchesAny(path, generatedPaths))
    .map(({ path, changed }) => ({ path, changed: Math.max(0, changed - (moved.get(path) ?? 0)) }))
  const largest = counted
    .filter(({ changed }) => changed > 0)
    .sort((a, b) => b.changed - a.changed)
    .slice(0, DIFF_LARGEST_SHOWN)
    .map(({ path, changed }) => `${path} (${changed})`)
  const movedOut = entries.reduce((sum, { path, changed }) => sum + Math.min(changed, moved.get(path) ?? 0), 0)
  return { lines: counted.reduce((sum, { changed }) => sum + changed, 0), largest, moved: movedOut }
}

// Fixed colors so the patch parses the same whatever the user's git config sets.
const GIT_DIFF_COLORS = [
  '-c', 'core.quotepath=off',
  '-c', 'color.diff.meta=bold',
  '-c', 'color.diff.old=red',
  '-c', 'color.diff.new=green',
  ...['oldMoved', 'newMoved', 'oldMovedAlternative', 'newMovedAlternative'].flatMap((name) => ['-c', `color.diff.${name}=magenta`]),
]
const GIT_DIFF_MOVED = ['--color=always', '--color-moved=zebra', '--color-moved-ws=allow-indentation-change', '--no-prefix', '-U0']

// `git diff --name-status -z -M`: "S\0path\0", or for renames/copies "R100\0old\0new\0".
function parseNameStatus(nameStatusZ) {
  const tokens = nameStatusZ.split('\0')
  const entries = []
  for (let i = 0; i + 1 < tokens.length; ) {
    const status = tokens[i][0]
    if (!status) break
    const paths = status === 'R' || status === 'C' ? [tokens[i + 1], tokens[i + 2]] : [tokens[i + 1]]
    entries.push({ status, paths })
    i += 1 + paths.length
  }
  return entries
}

// A contract test pins the interface as the plan stated it. The implementer adds tests of
// their own and never edits these; a wrong one goes back to its author with the reason.
export function changedContractTests(nameStatusZ) {
  return parseNameStatus(nameStatusZ)
    .filter(({ status, paths }) => status !== 'A' && status !== 'C' && isContractTest(paths[0]))
    .map(({ status, paths }) => `${status} ${paths[0]}`)
}

export function mutationTargets(nameStatusZ, globs) {
  return parseNameStatus(nameStatusZ)
    .filter(({ status }) => status !== 'D')
    .map(({ paths }) => paths[paths.length - 1])
    .filter((path) => isSource(path) && !isTest(path) && matchesAny(path, globs))
}

const isSkipCheckedFile = (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)

// A skipped or `.only` test turns a failing run green or hides the rest of the suite.
// patch: `git diff -U0 --no-prefix`. Only added lines in test files count. A line the
// diff also removes (moved, re-indented) is not new, so it passes. Returns "path:line: text".
export function skippedTestLines(patch, patterns) {
  const regexes = patterns.map((pattern) => new RegExp(pattern))
  const removed = new Set()
  const added = []
  let path = null
  let line = 0
  for (const row of patch.split('\n')) {
    if (row.startsWith('+++ ')) path = row.slice(4).replace(/\t$/, '')
    else if (row.startsWith('--- ')) continue
    else if (row.startsWith('@@')) line = Number(row.match(/\+(\d+)/)[1])
    else if (row.startsWith('-')) removed.add(row.slice(1).trim())
    else if (row.startsWith('+')) {
      added.push({ path, line, text: row.slice(1) })
      line++
    }
  }
  return added
    .filter(({ path: file, text }) => file && isSkipCheckedFile(file) && !removed.has(text.trim()) && regexes.some((re) => re.test(text)))
    .map(({ path: file, line: at, text }) => `${file}:${at}: ${text.trim()}`)
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
      /commit-msg:[\s\S]*repo-checks commit-msg/.test(text('lefthook.yml')),
      'Version Control: lefthook.yml runs repo-checks commit-msg on commit-msg',
    ],
    [
      paths.some((path) => /^eslint\.config\.[cm]?[jt]s$/.test(path) && text(path).includes('@k-b3r/agent-config/eslint')),
      'Design: eslint config extends @k-b3r/agent-config/eslint',
    ],
    [
      text('.dependency-cruiser.cjs').includes('@k-b3r/agent-config/dependency-cruiser'),
      'Design: .dependency-cruiser.cjs extends @k-b3r/agent-config/dependency-cruiser',
    ],
    [paths.some((path) => /^knip\.(json|jsonc|ts|js)$/.test(path)), 'Refactoring: knip config finds dead code'],
    // The three places GitHub reads a default template from.
    [
      paths.some((path) => /^(\.github\/|docs\/)?pull_request_template\.md$/i.test(path)),
      'Workflow: .github/pull_request_template.md gives PR bodies their sections',
    ],
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

function report(name, problems, okMessage, hints = []) {
  if (problems.length) console.error(`${name}:\n  ${[...problems, ...hints].join('\n  ')}`)
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
    return report('commits', problems, `${shas.length} ok`, [REWORD_HINT])
  },
  // Same rule as `commits`, before the commit exists. Merge commits are
  // skipped there (--no-merges), so here too: `git pull` and `git merge`
  // keep their default messages.
  'commit-msg'(file) {
    if (existsSync(git('rev-parse', '--git-path', 'MERGE_HEAD').trim())) return report('commit-msg', [], 'merge, skipped')
    const message = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n')
    return report('commit-msg', checkCommitMessage(message.trimStart()), 'ok')
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
  // Prints the tier on stdout (for `$GITHUB_OUTPUT`) and why on stderr. Labels and body come from the
  // workflow: REVIEW_PR_LABELS (comma-separated) and REVIEW_PR_BODY (the PR body, which can only escalate).
  'review-tier'(base, config) {
    const files = parseNameStatus(git('diff', '--name-status', '-z', '-M', `${base}...HEAD`))
    const patch = git('-c', 'core.quotepath=off', 'diff', '-U0', '--no-prefix', `${base}...HEAD`)
    const labels = (process.env.REVIEW_PR_LABELS ?? '').split(',').map((label) => label.trim()).filter(Boolean)
    const { tier, reasons } = reviewTier({ files, addedLines: addedLines(patch), labels, body: process.env.REVIEW_PR_BODY ?? '', config })
    console.log(tier)
    for (const reason of reasons) console.error(`  ${reason}`)
    // A glob list that matches nothing (a flat repo left on the module default) would quietly send every
    // PR, business logic included, to the cheap reviewer.
    const claudePaths = config.claudeReviewPaths ?? DEFAULTS.claudeReviewPaths
    if (!trackedAt('HEAD').some((path) => matchesAny(path, claudePaths))) {
      console.error(`warning: agentConfig.claudeReviewPaths (${claudePaths.join(', ')}) matches no tracked file, so no PR reaches the ${CLAUDE_TIER} reviewer on business-logic paths`)
    }
    return 0
  },
  'workflow-permissions'() {
    const files = trackedAt('HEAD')
      .filter((path) => /^\.github\/workflows\/.+\.ya?ml$/.test(path))
      .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    return report('workflow-permissions', writeAllWorkflows(files).map((p) => `${p}: replace write-all with the scopes the job needs`), 'ok')
  },
  'diff-size'(base, config) {
    if (process.env.ALLOW_LARGE_DIFF === 'true') return report('diff-size', [], 'skipped (label large-diff-approved)')
    const entries = parseNumstat(git('diff', '--numstat', '-z', `${base}...HEAD`))
    const moved = movedLinesByFile(git(...GIT_DIFF_COLORS, 'diff', ...GIT_DIFF_MOVED, `${base}...HEAD`))
    const { lines, largest, moved: movedTotal } = diffSize(entries, config, moved)
    const problems =
      lines > config.maxDiffLines
        ? [`${lines} changed lines, limit ${config.maxDiffLines}: split into stacked PRs (largest: ${largest.join(', ')}) or label large-diff-approved`]
        : []
    const movedNote = movedTotal ? `, ${movedTotal} moved lines not counted` : ''
    return report('diff-size', problems, `${lines} changed lines versus ${base}${movedNote}, limit ${config.maxDiffLines}`)
  },
  'contracts-unmodified'(base) {
    if (process.env.ALLOW_CONTRACT_CHANGES === 'true') {
      return report('contracts-unmodified', [], 'skipped (label contract-change-approved)')
    }
    const changed = changedContractTests(git('diff', '--name-status', '-z', '-M', `${base}...HEAD`))
    const problems = changed.map((entry) => `${entry}: contract tests are never edited; fix the contract comment and have its author update the test, or label contract-change-approved`)
    return report('contracts-unmodified', problems, `no contract test changed versus ${base}`)
  },
  'skip-only'(base, config) {
    const patch = git('-c', 'core.quotepath=off', 'diff', '-U0', '--no-prefix', `${base}...HEAD`)
    const problems = skippedTestLines(patch, config.skipPatterns).map(
      (found) => `${found}: fix or delete the test instead of skipping it`,
    )
    return report('skip-only', problems, `no test skipped or isolated versus ${base}`)
  },
  'mutation-targets'(base, config) {
    const targets = mutationTargets(git('diff', '--name-status', '-z', '-M', `${base}...HEAD`), config.mutationPaths)
    for (const target of targets) console.log(target)
    return 0
  },
  audit() {
    const WANTED = /(^|\/)(CLAUDE|CONTEXT)\.md$|^\.gitignore$|^lefthook\.yml$|^eslint\.config\.|^\.dependency-cruiser\.cjs$|^package\.json$|^\.github\/workflows\//
    const repo = Object.fromEntries(
      trackedAt('HEAD').map((path) => [path, WANTED.test(path) ? readFileSync(path, 'utf8') : '']),
    )
    return report('audit', auditWiring(repo), 'every shared check is wired')
  },
}

const NEEDS_BASE = new Set(['commits', 'escape-hatches', 'untested-modules', 'diff-size', 'contracts-unmodified', 'skip-only', 'mutation-targets', 'review-tier', 'all'])
const NOT_IN_ALL = new Set(['commit-msg', 'mutation-targets', 'review-tier'])

function main([command, base]) {
  if (!(command in COMMANDS) && command !== 'all') {
    console.error(`usage: repo-checks <${[...Object.keys(COMMANDS), 'all'].join('|')}> [base-ref]`)
    return 2
  }
  if (command === 'commit-msg' && !base) {
    console.error('repo-checks commit-msg needs the message file, e.g. .git/COMMIT_EDITMSG')
    return 2
  }
  if (NEEDS_BASE.has(command) && !base) {
    console.error(`repo-checks ${command} needs a base ref, e.g. origin/main`)
    return 2
  }
  const config = loadConfig()
  const run = command === 'all' ? Object.keys(COMMANDS).filter((name) => !NOT_IN_ALL.has(name)) : [command]
  // Run every check even after a failure, so one run reports them all.
  return run.map((name) => COMMANDS[name](base, config)).some(Boolean) ? 1 : 0
}

// realpath: package managers expose the bin through a symlink.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
