#!/usr/bin/env node
// PreToolUse guard for the rules agents tend to break before CI can see them:
// Version Control (no push to main, no --no-verify, no AI attribution, no
// hand-edited generated files) and Security (no reading secret files, no
// recursive deletes outside the workspace, no destructive SQL or applied
// migrations outside a test database). Exit 2 blocks the call and shows Claude
// the reason. Wired into ~/.claude/settings.json by install.sh.
// Grep and Glob are checked on their explicit path, glob and pattern arguments (never on Grep's
// content regex). Not covered: a directory-wide Grep (ripgrep skips gitignored files by default),
// and shell indirection (`cat $(echo .env)`): the hook sees command text only, so it cannot know
// what a substitution or script will read. Test-database heuristic hole: `test` in a username,
// hostname or other unquoted flag (`psql -d prod -U test`) counts as a test target.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasAiAttribution } from '../scripts/repo-checks.mjs'

const PROTECTED = /^(main|master)$/
const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'uv.lock'])
const GENERATED_MARKER = /@generated|DO NOT EDIT/
// Markers count only near the top, where generators put them.
const MARKER_WINDOW = 5
// `git -C <dir> push` / `git -c k=v push` are still pushes.
const GIT_PUSH = /\bgit(?:\s+-[Cc]\s+\S+)*\s+push\b/

const SECRET_PATHS = [
  /(^|\/)\.env(\.[^/]+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore)$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /(^|\/)\.(aws|ssh|gnupg|azure)\//,
  /(^|\/)\.kube\/config$/,
  /(^|\/)\.config\/gcloud\//,
  /(^|\/)\.(netrc|pgpass|git-credentials)$/,
  /(^|\/)\.docker\/config\.json$/,
]
// Variable names and public keys, not credentials.
const SECRET_TEMPLATE = /\.(example|sample|template|dist|pub)$/
// Commands that put a file's content in front of the agent or copy it somewhere.
const READ_COMMANDS = new Set([
  'cat', 'less', 'more', 'head', 'tail', 'tac', 'nl', 'bat', 'grep', 'egrep', 'fgrep', 'rg', 'ag',
  'sed', 'awk', 'cut', 'sort', 'uniq', 'diff', 'cp', 'mv', 'source', '.', 'strings', 'xxd', 'od', 'base64',
])
// Words that put another command first; skipped to find the command being run.
const WRAPPERS = new Set(['sudo', 'command', 'exec', 'time', 'nohup', 'env', 'nice'])
// Commands whose arguments are text, not something that runs.
const TEXT_COMMANDS = new Set(['git', 'gh', 'echo', 'printf', 'grep', 'rg', 'man'])
const DB_CLIENT = /\b(psql|mysql|mariadb|sqlite3|mongosh|redis-cli|sqlcmd|duckdb)\b/
const DESTRUCTIVE_SQL = /\b(drop\s+(table|database|schema|index|view)|truncate|flushall|flushdb)\b/i
// A database named `test` or `*_test`, or a TEST_* variable, is disposable. Heuristic: the
// word anywhere in the command counts, except inside quoted text (SQL) unless it is a URL.
const TEST_TARGET = /(^|[^a-z0-9])test([^a-z0-9]|$)/i
const MIGRATIONS = [
  /\bdrizzle-kit\s+(migrate|push|drop)\b/,
  /\bprisma\s+(migrate\s+(dev|deploy|reset|resolve)|db\s+(push|execute))\b/,
  /\b(knex|sequelize|typeorm|kysely|mikro-orm)\b[^;&|]*\b(migrate|db:migrate|migration:run|migration:revert)\b/,
  /\balembic\s+(upgrade|downgrade)\b/,
  /\bflask\s+db\s+(upgrade|downgrade)\b/,
  /\bmanage\.py\s+migrate\b/,
  /\b(rails|rake)\s+db:(migrate|rollback|reset|drop)\b/,
  /\bgoose\b[^;&|]*\b(up|down|reset)\b/,
  /\bflyway\s+(migrate|clean)\b/,
  /\bdiesel\s+(migration\s+run|database\s+reset)\b/,
  /\b(pnpm|npm|yarn|bun)\s+(run\s+)?[\w:.-]*(migrate|db:push)\b/,
]
// /tmp/<name>: scratch space, so session scratchpads can be cleaned up.
const TMP_SUBFOLDER = /^\/tmp\/[^*?[\]/]+/

export function checkSecretPath(path) {
  if (SECRET_TEMPLATE.test(path)) return null
  return SECRET_PATHS.some((pattern) => pattern.test(path))
    ? `${path} is a secret file (credentials or keys): use .env.example for variable names, or ask the user.`
    : null
}

export function checkSearch(toolName, input) {
  const targets = toolName === 'Grep' ? [input.path, input.glob] : [input.path, input.pattern]
  for (const target of targets) {
    const reason = typeof target === 'string' ? checkSecretPath(target) : null
    if (reason) return reason
  }
  return null
}

const withoutSqlText = (segment) => segment.replace(/(["'])(?:(?!\1).)*\1/g, (quoted) => (quoted.includes('://') ? quoted : ' '))

function commandWords(segment) {
  const words = segment.trim().split(/\s+/).filter(Boolean)
  const start = words.findIndex((word) => !/^\w+=/.test(word) && !WRAPPERS.has(word))
  return start === -1 ? [] : words.slice(start)
}

const unquote = (word) => word.replace(/^[<@'"]+|['"]+$/g, '').replace(/^--[\w-]+=/, '')

function checkSecretRead(segment) {
  const [command, ...args] = commandWords(segment)
  if (!command || !(READ_COMMANDS.has(basename(command)) || /(^|\s)<\s*\S/.test(segment))) return null
  for (const arg of args.map(unquote)) {
    const reason = checkSecretPath(arg.replace(/^~(?=\/)/, homedir()))
    if (reason) return reason
  }
  return null
}

function checkRecursiveDelete(segment, cwd) {
  const [command, ...args] = commandWords(segment)
  if (command !== 'rm' || !args.some((arg) => /^-[a-zA-Z]*[rR]|^--recursive$/.test(arg))) return null
  const workspace = resolve(cwd)
  for (const target of args.filter((arg) => !arg.startsWith('-')).map(unquote)) {
    const expanded = target.replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, homedir())
    const unresolvable = /[$`]/.test(expanded)
    const path = resolve(workspace, expanded)
    const inside = path.startsWith(workspace + sep)
    if (unresolvable || !(inside || TMP_SUBFOLDER.test(path))) {
      return `Recursive delete of ${target} blocked: only paths inside the workspace (${workspace}) or /tmp subfolders, written literally.`
    }
  }
  return null
}

function checkDatabaseSegment(segment) {
  const [command] = commandWords(segment)
  if (!command || TEXT_COMMANDS.has(basename(command)) || TEST_TARGET.test(withoutSqlText(segment))) return null
  if (DB_CLIENT.test(segment) && DESTRUCTIVE_SQL.test(segment)) {
    return 'Destructive SQL (DROP, TRUNCATE, FLUSH) blocked: run it only against a test database (named test or *_test, or via TEST_DATABASE_URL).'
  }
  if (MIGRATIONS.some((pattern) => pattern.test(segment))) {
    return 'Applying migrations is blocked: generate them and let a human apply them, or target a test database (TEST_DATABASE_URL).'
  }
  return null
}

function pushTargetsProtected(segment, branch) {
  const args = segment.replace(new RegExp(`^.*?${GIT_PUSH.source}`), '').trim().split(/\s+/).filter(Boolean)
  const [, ...refspecs] = args.filter((arg) => !arg.startsWith('-'))
  if (!refspecs.length) return PROTECTED.test(branch)
  return refspecs.some((refspec) => PROTECTED.test(refspec.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '')))
}

export function checkBash(command, branch, cwd = process.cwd()) {
  if (/\bgit\b[^;&|\n]*\s--no-verify\b/.test(command)) return 'Never --no-verify: fix what the hook reports instead.'
  const segments = command.split(/&&|\|\||;|\||\n/)
  if (segments.some((segment) => GIT_PUSH.test(segment) && pushTargetsProtected(segment, branch))) {
    return 'Never push to main/master: push a branch and open a PR.'
  }
  if (/\bgit\s+commit\b|\bgh\s+pr\s+(create|edit|comment)\b/.test(command) && hasAiAttribution(command)) {
    return 'No AI attribution (Co-Authored-By / Generated with) in commits or PRs.'
  }
  for (const segment of segments) {
    const reason = checkSecretRead(segment) ?? checkRecursiveDelete(segment, cwd) ?? checkDatabaseSegment(segment)
    if (reason) return reason
  }
  return null
}

export function checkEdit(path, content) {
  if (LOCKFILES.has(basename(path))) return `${basename(path)} is generated: change the manifest and rerun the package manager.`
  const head = (content ?? '').split('\n').slice(0, MARKER_WINDOW).join('\n')
  if (GENERATED_MARKER.test(head)) return `${path} is marked generated: change its source and rerun the generator.`
  return null
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const tool = input.tool_input ?? {}
  const cwd = input.cwd ?? process.cwd()
  const path = tool.file_path ?? tool.notebook_path
  let reason = null
  if (input.tool_name === 'Bash') reason = checkBash(tool.command ?? '', currentBranch(cwd), cwd)
  else if (input.tool_name === 'Grep' || input.tool_name === 'Glob') reason = checkSearch(input.tool_name, tool)
  else if (path) reason = checkSecretPath(path) ?? (input.tool_name === 'Read' ? null : checkEdit(path, readIfExists(path)))
  if (reason) {
    console.error(`Blocked by agent-config guard: ${reason}`)
    process.exit(2)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
