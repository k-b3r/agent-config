// The agent-config guard for pi: the same rules as hooks/guard.mjs (Claude Code's PreToolUse hook),
// run on pi's `tool_call` event, which can block. Blocks pushes to main, --no-verify, AI attribution,
// edits to generated files, opening secret files to read them, risky recursive deletes and destructive
// SQL or migrations outside a test database. The rule code is shared, so there is one list of rules.
// Set AGENT_GUARD=off when starting pi to run without it. Linked into ~/.pi/agent/extensions by install.sh.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The extension is installed as a symlink; the rules sit next to its real location.
const RULES_URL = pathToFileURL(join(dirname(realpathSync(fileURLToPath(import.meta.url))), '..', '..', 'hooks', 'guard.mjs')).href

// Pure: maps a pi tool call onto the shared rules. Returns the reason to block, or null.
export function guardToolCall(rules, { toolName, input, cwd, readFile, branchOf }) {
  const absolute = (path) => (typeof path === 'string' && path !== '' ? (isAbsolute(path) ? path : resolve(cwd, path)) : null)
  switch (toolName) {
    case 'bash':
      return rules.checkBash(input.command ?? '', branchOf(cwd), cwd)
    case 'read': {
      const path = absolute(input.path)
      return path ? rules.checkSecretPath(path) : null
    }
    case 'edit':
    case 'write': {
      const path = absolute(input.path)
      return path ? (rules.checkSecretPath(path) ?? rules.checkEdit(path, readFile(path))) : null
    }
    case 'grep':
      return rules.checkSearch('Grep', { path: absolute(input.path) ?? undefined, glob: input.glob })
    case 'find':
    case 'glob':
    case 'ls':
      return rules.checkSearch('Glob', { path: absolute(input.path) ?? undefined, pattern: input.pattern })
    default:
      return null
  }
}

const readIfExists = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const currentBranch = (cwd) => {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export default function agentGuard(pi) {
  if (process.env.AGENT_GUARD === 'off') return
  let rules
  let failed = false
  pi.on('tool_call', async (event, ctx) => {
    if (failed) return
    if (!rules) {
      try {
        rules = await import(RULES_URL)
      } catch (error) {
        // Fail open, loudly: a guard that silently stops working is the problem it exists to prevent.
        failed = true
        ctx?.ui?.notify?.(`agent-config guard is OFF: could not load ${RULES_URL} (${error.message})`, 'error')
        return
      }
    }
    const reason = guardToolCall(rules, {
      toolName: event.toolName,
      input: event.input ?? {},
      cwd: ctx?.cwd ?? process.cwd(),
      readFile: readIfExists,
      branchOf: currentBranch,
    })
    if (reason) return { block: true, reason: `Blocked by agent-config guard: ${reason}` }
  })
}
