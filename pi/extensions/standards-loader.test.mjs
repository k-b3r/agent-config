import assert from 'node:assert/strict'
import { test } from 'node:test'
import standardsLoader, { MARKER, standardsBlock } from './standards-loader.js'

test('standardsBlock wraps both files under the marker and skips a missing one', () => {
  const both = standardsBlock((path) => (path.endsWith('CODING_STANDARDS.md') ? '# Standards\n' : path.endsWith('TOOLS.md') ? '# Tools\n' : null))
  assert.ok(both.startsWith(MARKER))
  assert.match(both, /<file name="CODING_STANDARDS.md">\n# Standards\n<\/file>/)
  assert.match(both, /<file name="TOOLS.md">\n# Tools\n<\/file>/)
  const one = standardsBlock((path) => (path.endsWith('TOOLS.md') ? '# Tools' : null))
  assert.doesNotMatch(one, /<file name="CODING_STANDARDS.md">/)
  assert.equal(standardsBlock(() => null), null)
})

const fakePi = () => {
  const handlers = {}
  return { on: (name, fn) => (handlers[name] = fn), handlers }
}

test('the handler appends the standards inside a git repo, once, and not outside one', async () => {
  const pi = fakePi()
  standardsLoader(pi)
  const repo = process.cwd() // this repo is a git repo
  const first = await pi.handlers.before_agent_start({ systemPrompt: 'base prompt' }, { cwd: repo })
  assert.ok(first.systemPrompt.startsWith('base prompt\n\n' + MARKER))
  assert.match(first.systemPrompt, /CODING_STANDARDS\.md/)
  assert.equal(await pi.handlers.before_agent_start({ systemPrompt: first.systemPrompt }, { cwd: repo }), undefined)
  assert.equal(await pi.handlers.before_agent_start({ systemPrompt: 'base' }, { cwd: '/' }), undefined)
})

test('PI_STANDARDS=off registers nothing', () => {
  process.env.PI_STANDARDS = 'off'
  try {
    const pi = fakePi()
    standardsLoader(pi)
    assert.deepEqual(Object.keys(pi.handlers), [])
  } finally {
    delete process.env.PI_STANDARDS
  }
})
