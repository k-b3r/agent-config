#!/usr/bin/env node
// Adds the guard to ~/.claude/settings.json as a PreToolUse hook. Idempotent:
// an existing entry pointing at the guard is left as is; every other key and
// hook is preserved. Called by install.sh.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MATCHER = 'Bash|Read|Edit|Write|MultiEdit|NotebookEdit'

export function withGuard(settings, command) {
  const preToolUse = settings.hooks?.PreToolUse ?? []
  const isGuard = (entry) => entry.hooks?.some((hook) => hook.command === command)
  if (preToolUse.some((entry) => isGuard(entry) && entry.matcher === MATCHER)) return settings
  // An install from before the guard watched Read keeps its entry; only the matcher widens.
  if (preToolUse.some(isGuard)) {
    const entries = preToolUse.map((entry) => (isGuard(entry) ? { ...entry, matcher: MATCHER } : entry))
    return { ...settings, hooks: { ...settings.hooks, PreToolUse: entries } }
  }
  return {
    ...settings,
    hooks: {
      ...settings.hooks,
      PreToolUse: [...preToolUse, { matcher: MATCHER, hooks: [{ type: 'command', command, timeout: 10 }] }],
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [settingsPath, command] = process.argv.slice(2)
  const before = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {}
  const after = withGuard(before, command)
  if (after === before) console.log('guard hook already in settings.json')
  else {
    writeFileSync(settingsPath, `${JSON.stringify(after, null, 2)}\n`)
    console.log(`wired guard hook in ${settingsPath}`)
  }
}
