// Puts CODING_STANDARDS.md and TOOLS.md in front of the agent at the start of every run inside a git
// repo. Pi does not expand the `@CODING_STANDARDS.md` imports in AGENTS.md (Claude Code does), so
// without this the standards are only read when someone points at the file. The files are read live
// from this repo, so a pull is enough to update them. Set PI_STANDARDS=off when starting pi to skip.
// Linked into ~/.pi/agent/extensions by install.sh.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(realpathSync(fileURLToPath(import.meta.url))), '..', '..')
const FILES = ['CODING_STANDARDS.md', 'TOOLS.md']
export const MARKER = '<!-- agent-config standards -->'

export function standardsBlock(read) {
  const parts = FILES.map((name) => ({ name, text: read(join(REPO, name)) })).filter((part) => part.text)
  if (!parts.length) return null
  const body = parts.map((part) => `<file name="${part.name}">\n${part.text.trim()}\n</file>`).join('\n')
  return `${MARKER}\n<coding_standards>\nLoaded at session start by the standards-loader pi extension. Follow them; a repo's own CODING_STANDARDS.md wins on conflict.\n${body}\n</coding_standards>`
}

const readIfExists = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const insideRepo = (cwd) => {
  try {
    execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export default function standardsLoader(pi) {
  if (process.env.PI_STANDARDS === 'off') return
  pi.on('before_agent_start', async (event, ctx) => {
    if (event.systemPrompt.includes(MARKER)) return
    if (!insideRepo(ctx?.cwd ?? process.cwd())) return
    const block = standardsBlock(readIfExists)
    if (!block) {
      ctx?.ui?.notify?.('standards-loader: CODING_STANDARDS.md not found next to the extension', 'warning')
      return
    }
    return { systemPrompt: `${event.systemPrompt}\n\n${block}` }
  })
}
