#!/usr/bin/env node
// Adds the guard to ~/.claude/settings.json as a PreToolUse hook. Idempotent:
// an existing entry pointing at the guard is left as is; every other key and
// hook is preserved. Called by install.sh.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MATCHER = 'Bash|Edit|Write|MultiEdit|NotebookEdit'

export function withGuard(settings, command) {
  const preToolUse = settings.hooks?.PreToolUse ?? []
  if (preToolUse.some((entry) => entry.hooks?.some((hook) => hook.command === command))) return settings
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
    console.log(`added guard hook to ${settingsPath}`)
  }
}
