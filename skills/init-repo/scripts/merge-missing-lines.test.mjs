import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { mergeMissingLines } from './merge-missing-lines.mjs'

const TEMPLATE = ['# deps', 'node_modules/', 'dist/', '', '.env', '.env.*', '!.env*.example', '*.swp', ''].join('\n')

test('mergeMissingLines appends only the template patterns the target lacks, keeping the target as it is', () => {
  const { text, added } = mergeMissingLines(TEMPLATE, 'node_modules/\n*.log\n.env\n')
  assert.deepEqual(added, ['dist/', '.env.*', '!.env*.example', '*.swp'])
  assert.ok(text.startsWith('node_modules/\n*.log\n.env\n'))
  assert.match(text, /\ndist\/\n\.env\.\*\n!\.env\*\.example\n\*\.swp\n$/)
})

test('mergeMissingLines leaves a target that has every pattern untouched, ignoring blanks, comments and trailing spaces', () => {
  const target = 'dist/  \n# mine\nnode_modules/\n.env\n.env.*\n!.env*.example\n*.swp'
  const { text, added } = mergeMissingLines(TEMPLATE, target)
  assert.deepEqual(added, [])
  assert.equal(text, target)
})

test('mergeMissingLines starts a new line when the target lacks a final newline, and keeps CRLF files CRLF', () => {
  assert.equal(mergeMissingLines('a\nb\n', 'a').text, 'a\n# added by /init-repo from the template\nb\n')
  assert.equal(mergeMissingLines('a\nb\n', 'a\r\n').text, 'a\r\n# added by /init-repo from the template\r\nb\r\n')
})

test('mergeMissingLines handles an empty target and warns when an added pattern lands after a negation of the target', () => {
  assert.deepEqual(mergeMissingLines('a\n', '').added, ['a'])
  const { warnings } = mergeMissingLines('.env.*\n', '.env\n!.env.example\n')
  assert.match(warnings[0], /negation/)
  assert.deepEqual(mergeMissingLines('.env.*\n', '.env\n').warnings, [])
})

test('merge-missing-lines.mjs edits the target file in place and reports what it added, also through a symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-lines-'))
  writeFileSync(join(dir, 'template'), 'a\nb\n')
  writeFileSync(join(dir, 'target'), 'a\n')
  const script = fileURLToPath(new URL('./merge-missing-lines.mjs', import.meta.url))
  symlinkSync(script, join(dir, 'link.mjs'))
  const run = spawnSync('node', [join(dir, 'link.mjs'), join(dir, 'template'), join(dir, 'target')], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /added 1 line/)
  assert.equal(readFileSync(join(dir, 'target'), 'utf8'), 'a\n# added by /init-repo from the template\nb\n')
  assert.equal(spawnSync('node', [script], { encoding: 'utf8' }).status, 2)
})
