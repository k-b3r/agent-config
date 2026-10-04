#!/usr/bin/env node
// PreToolUse guard for the Version Control rules agents tend to break before CI
// can see them: no push to main, no --no-verify, no AI attribution, no
// hand-edited generated files. Exit 2 blocks the call and shows Claude the reason.
// Wired into ~/.claude/settings.json by install.sh.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasAiAttribution } from '../scripts/repo-checks.mjs'

const PROTECTED = /^(main|master)$/
const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'uv.lock'])
const GENERATED_MARKER = /@generated|DO NOT EDIT/
// Markers count only near the top, where generators put them.
const MARKER_WINDOW = 5
// `git -C <dir> push` / `git -c k=v push` are still pushes.
const GIT_PUSH = /\bgit(?:\s+-[Cc]\s+\S+)*\s+push\b/

function pushTargetsProtected(segment, branch) {
  const args = segment.replace(new RegExp(`^.*?${GIT_PUSH.source}`), '').trim().split(/\s+/).filter(Boolean)
  const [, ...refspecs] = args.filter((arg) => !arg.startsWith('-'))
  if (!refspecs.length) return PROTECTED.test(branch)
  return refspecs.some((refspec) => PROTECTED.test(refspec.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '')))
}

export function checkBash(command, branch) {
  if (/\bgit\b[^;&|\n]*\s--no-verify\b/.test(command)) return 'Never --no-verify: fix what the hook reports instead.'
  const segments = command.split(/&&|\|\||;|\||\n/)
  if (segments.some((segment) => GIT_PUSH.test(segment) && pushTargetsProtected(segment, branch))) {
    return 'Never push to main/master: push a branch and open a PR.'
  }
  if (/\bgit\s+commit\b|\bgh\s+pr\s+(create|edit|comment)\b/.test(command) && hasAiAttribution(command)) {
    return 'No AI attribution (Co-Authored-By / Generated with) in commits or PRs.'
  }
  return null
}

export function checkEdit(path, content) {
  if (LOCKFILES.has(basename(path))) return `${basename(path)} is generated: change the manifest and rerun the package manager.`
  const head = (content ?? '').split('\n').slice(0, MARKER_WINDOW).join('\n')
  if (GENERATED_MARKER.test(head)) return `${path} is marked generated: change its source and rerun the generator.`
  return null
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const tool = input.tool_input ?? {}
  const reason =
    input.tool_name === 'Bash'
      ? checkBash(tool.command ?? '', currentBranch(input.cwd ?? process.cwd()))
      : tool.file_path
        ? checkEdit(tool.file_path, readIfExists(tool.file_path))
        : null
  if (reason) {
    console.error(`Blocked by agent-config guard: ${reason}`)
    process.exit(2)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
