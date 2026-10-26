import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

// A script that runs only when invoked directly compares argv[1] with
// import.meta.url. Node keeps argv[1] as the path it was given but resolves
// import.meta.url, so through a symlink (~/.claude/hooks, ~/.claude/skills, a
// pnpm bin) a bare comparison is false and the script silently does nothing.
// The working form wraps argv[1] in realpathSync, as most scripts here do.
const BARE_COMPARISON = /process\.argv\[1\]\s*===\s*fileURLToPath\(import\.meta\.url\)/

function scripts(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes('node_modules'))
}

test('no script compares argv[1] with import.meta.url without resolving the symlink', () => {
  const offenders = ['hooks', 'scripts', 'skills']
    .flatMap((dir) => scripts(join(ROOT, dir)))
    .filter((path) => BARE_COMPARISON.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(ROOT.length + 1))
  assert.deepEqual(offenders, [])
})
