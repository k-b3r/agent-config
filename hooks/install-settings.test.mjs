import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withGuard } from './install-settings.mjs'

const COMMAND = 'node "$HOME/.claude/hooks/agent-config-guard.mjs"'

test('withGuard adds a PreToolUse entry and keeps every other setting and hook', () => {
  const settings = { model: 'x', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'a' }] }] } }
  const result = withGuard(settings, COMMAND)
  assert.equal(result.model, 'x')
  assert.deepEqual(result.hooks.SessionStart, settings.hooks.SessionStart)
  assert.equal(result.hooks.PreToolUse.length, 1)
  assert.equal(result.hooks.PreToolUse[0].hooks[0].command, COMMAND)
})

test('withGuard is a no-op when the guard is already wired', () => {
  const once = withGuard({}, COMMAND)
  assert.equal(withGuard(once, COMMAND), once)
})

test('withGuard widens the matcher of an installed guard so it also sees Read', () => {
  const old = { hooks: { PreToolUse: [{ matcher: 'Bash|Edit|Write', hooks: [{ type: 'command', command: COMMAND, timeout: 10 }] }] } }
  const result = withGuard(old, COMMAND)
  assert.equal(result.hooks.PreToolUse.length, 1)
  assert.match(result.hooks.PreToolUse[0].matcher, /\bRead\b/)
  assert.equal(result.hooks.PreToolUse[0].hooks[0].command, COMMAND)
})

test('withGuard widens the matcher of a Read-era install so it also sees Grep and Glob', () => {
  const old = { hooks: { PreToolUse: [{ matcher: 'Bash|Read|Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: COMMAND, timeout: 10 }] }] } }
  const result = withGuard(old, COMMAND)
  assert.equal(result.hooks.PreToolUse.length, 1)
  assert.match(result.hooks.PreToolUse[0].matcher, /\bGrep\b/)
  assert.match(result.hooks.PreToolUse[0].matcher, /\bGlob\b/)
})
