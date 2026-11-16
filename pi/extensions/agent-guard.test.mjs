import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as rules from '../../hooks/guard.mjs'
import agentGuard, { guardToolCall } from './agent-guard.js'

const call = (toolName, input, extra = {}) =>
  guardToolCall(rules, { toolName, input, cwd: '/repo', readFile: () => null, branchOf: () => 'feature', ...extra })

test('bash: push to main, --no-verify, AI attribution and secret reads are blocked', () => {
  assert.match(call('bash', { command: 'git push origin main' }), /main/)
  assert.match(call('bash', { command: 'git commit --no-verify -m x' }), /--no-verify/)
  assert.match(call('bash', { command: 'git commit -m "x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"' }), /attribution/i)
  assert.match(call('bash', { command: 'cat .env' }), /secret/i)
})

test('bash: a bare push is judged by the branch the repo is on', () => {
  assert.equal(call('bash', { command: 'git push' }, { branchOf: () => 'feature' }), null)
  assert.match(call('bash', { command: 'git push' }, { branchOf: () => 'main' }), /main/)
})

test('bash: ordinary commands pass', () => {
  assert.equal(call('bash', { command: 'pnpm test && git status' }), null)
  assert.equal(call('bash', {}), null)
})

test('read, edit and write: secret files are blocked, relative paths resolve against the cwd', () => {
  assert.match(call('read', { path: '/repo/.env' }), /secret/i)
  assert.match(call('read', { path: '.env.local' }), /secret/i)
  assert.match(call('write', { path: '/home/kim/.pi/agent/auth.json', content: '{}' }), /secret/i)
  assert.equal(call('read', { path: '/repo/.env.example' }), null)
  assert.equal(call('read', { path: 'src/a.ts' }), null)
})

test('edit and write: lockfiles and files marked generated are blocked', () => {
  assert.match(call('edit', { path: 'pnpm-lock.yaml' }), /generated/)
  const generated = (path) => (path.endsWith('client.ts') ? '// @generated\nexport {}' : null)
  assert.match(call('write', { path: 'src/client.ts', content: 'x' }, { readFile: generated }), /generated/)
  assert.equal(call('write', { path: 'src/other.ts', content: 'x' }, { readFile: generated }), null)
})

test('search tools: an explicit secret path or glob is blocked', () => {
  assert.match(call('grep', { path: '/repo/.env' }), /secret/i)
  assert.match(call('find', { pattern: '**/.env' }), /secret/i)
  assert.equal(call('grep', { path: 'src' }), null)
})

test('unknown tools and missing input pass', () => {
  assert.equal(call('subagent', { task: 'cat .env' }), null)
  assert.equal(call('read', {}), null)
})

// A fake pi that records handlers, to test the registration and the blocking shape.
const fakePi = () => {
  const handlers = {}
  return { on: (name, fn) => (handlers[name] = fn), handlers }
}

test('the extension returns { block: true, reason } for a blocked call and nothing otherwise', async () => {
  const pi = fakePi()
  agentGuard(pi)
  const blocked = await pi.handlers.tool_call({ toolName: 'bash', input: { command: 'git push origin main' } }, { cwd: '/' })
  assert.equal(blocked.block, true)
  assert.match(blocked.reason, /^Blocked by agent-config guard: /)
  assert.equal(await pi.handlers.tool_call({ toolName: 'bash', input: { command: 'ls' } }, { cwd: '/' }), undefined)
})

test('AGENT_GUARD=off registers nothing', () => {
  process.env.AGENT_GUARD = 'off'
  try {
    const pi = fakePi()
    agentGuard(pi)
    assert.deepEqual(Object.keys(pi.handlers), [])
  } finally {
    delete process.env.AGENT_GUARD
  }
})
