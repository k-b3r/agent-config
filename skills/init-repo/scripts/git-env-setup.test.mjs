import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SETUP = fileURLToPath(new URL('../templates/typescript/tests/setup/clear-git-env.ts', import.meta.url))
const GIT_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
]

const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...Object.fromEntries(GIT_VARS.map((name) => [name, undefined])) } })

// What a unit test does: make a temp repo and give it an identity, with `git -C <temp>`.
const TEST_BODY = `
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const temp = mkdtempSync(join(tmpdir(), 'unit-test-repo-'))
execFileSync('git', ['-C', temp, 'init', '-q', '-b', 'main'])
execFileSync('git', ['-C', temp, 'config', 'user.name', 'test identity'])
`

// A "real" repo, and a child process started the way git starts a hook: GIT_DIR and GIT_INDEX_FILE set.
function runAsHook(withSetup) {
  const real = mkdtempSync(join(tmpdir(), 'real-repo-'))
  gitIn(real, 'init', '-q', '-b', 'main')
  const work = mkdtempSync(join(tmpdir(), 'hook-run-'))
  const entry = join(work, 'run.mjs')
  if (withSetup) copyFileSync(SETUP, join(work, 'setup.mjs')) // the template file holds plain JS, so a copy runs without type stripping
  writeFileSync(entry, `${withSetup ? "import './setup.mjs'\n" : ''}${TEST_BODY}`)
  execFileSync('node', [entry], {
    env: { ...process.env, GIT_DIR: join(real, '.git'), GIT_INDEX_FILE: join(real, '.git', 'index') },
  })
  return gitIn(real, 'config', '--local', '--list')
}

test('without the setup file, a test that runs `git -C <temp>` under hook variables rewrites the real repository', () => {
  assert.match(runAsHook(false), /user\.name=test identity/)
})

test('with the setup file imported first, the same test leaves the real repository alone', () => {
  assert.doesNotMatch(runAsHook(true), /user\.name=test identity/)
})

test('the setup file deletes every git variable git exports to hooks', () => {
  const text = readFileSync(SETUP, 'utf8')
  for (const name of GIT_VARS) assert.match(text, new RegExp(`\\b${name}\\b`), name)
})
