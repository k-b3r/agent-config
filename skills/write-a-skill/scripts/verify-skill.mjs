#!/usr/bin/env node
// Checks that a skill changes agent behavior: runs headless `pi -p` sessions in
// throwaway repos that hold only the skill under test, then reports per prompt whether
// the agent loaded the skill and whether a check command (exit 0) saw its effect.
//
// usage: verify-skill.mjs <skill-dir> --prompt "<p>" [--prompt "<p2>" ...] --check "<shell>"
//          [--runs 3] [--fixture <dir>] [--allow "read,write,edit,bash"] [--model <m>]
// The check runs in the run's repo, e.g. `head -1 OUT.md | grep -q marker`.
// Transcripts land in the printed work dir for a closer look.
// Needs an authenticated `pi`. Each run is a real (billed) session. pi has no Skill tool: an agent loads
// a skill by reading its SKILL.md, so "loaded" means the transcript shows a read of that file.
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_RUNS = 3
const RUN_TIMEOUT_MS = 300_000
const DEFAULT_MODEL = 'opencode-go/deepseek-v4.1-flash'
// The copy under test gets this suffix so an installed skill of the same name can't stand in for it.
const NAME_SUFFIX = '-verify'

// transcript: the JSON lines of `pi -p --mode json`. A `read` tool call on <skill>/SKILL.md is the load.
export function skillLoaded(transcript, skill) {
  for (const raw of transcript.split('\n')) {
    let event
    try {
      event = JSON.parse(raw)
    } catch {
      continue
    }
    const path = event?.type === 'tool_execution_start' && event.toolName === 'read' ? event.args?.path : null
    if (typeof path === 'string' && path.endsWith(`/${skill}/SKILL.md`)) return true
  }
  return false
}

export function renameSkill(markdown, name) {
  return markdown.replace(/^(---\n[\s\S]*?^name:)[^\n]*$/m, `$1 ${name}`)
}

export function summarize(runs) {
  const byPrompt = []
  for (const run of runs) {
    let row = byPrompt.find((r) => r.prompt === run.prompt)
    if (!row) byPrompt.push((row = { prompt: run.prompt, runs: 0, loaded: 0, checked: 0 }))
    row.runs += 1
    row.loaded += run.loaded ? 1 : 0
    row.checked += run.checked ? 1 : 0
  }
  return { pass: runs.every((run) => run.loaded && run.checked), byPrompt }
}

function prepareRepo({ dir, fixture, skillDir, skillName }) {
  mkdirSync(dir, { recursive: true })
  if (fixture) cpSync(fixture, dir, { recursive: true })
  if (!existsSync(join(dir, '.git'))) {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['-c', 'user.name=verify', '-c', 'user.email=v@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'initial'], { cwd: dir })
  }
  const target = join(dir, '.verify-skills', skillName)
  cpSync(skillDir, target, { recursive: true })
  const md = join(target, 'SKILL.md')
  writeFileSync(md, renameSkill(readFileSync(md, 'utf8'), skillName))
}

// --no-skills plus one --skill: an installed skill of the same name cannot stand in for the copy under test.
// --no-context-files and --no-session keep the run to the prompt and the skill.
function runSession({ dir, prompt, allow, model, skillName }) {
  const args = ['-p', '--mode', 'json', '--no-session', '--no-context-files', '--no-skills', '--skill', join(dir, '.verify-skills', skillName)]
  args.push('--tools', allow.join(','), '--model', model ?? DEFAULT_MODEL, '--thinking', 'low', prompt)
  return new Promise((done) => {
    let out = ''
    const child = spawn('pi', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => child.kill('SIGKILL'), RUN_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (out += chunk))
    child.on('close', () => {
      clearTimeout(timer)
      done(out)
    })
  })
}

function passesCheck(dir, check) {
  try {
    execFileSync('bash', ['-c', check], { cwd: dir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function main(argv) {
  const prompts = []
  const opts = { runs: DEFAULT_RUNS, allow: ['read', 'write', 'edit'] }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (flag === '--prompt') prompts.push(value), i++
    else if (flag === '--check') (opts.check = value), i++
    else if (flag === '--runs') (opts.runs = Number(value)), i++
    else if (flag === '--fixture') (opts.fixture = resolve(value)), i++
    else if (flag === '--allow') (opts.allow = value.split(',')), i++
    else if (flag === '--model') (opts.model = value), i++
    else rest.push(flag)
  }
  const skillDir = rest[0] && resolve(rest[0])
  if (!skillDir || !existsSync(join(skillDir, 'SKILL.md')) || prompts.length === 0 || !opts.check) {
    console.error('usage: verify-skill.mjs <skill-dir> --prompt "<p>" [--prompt ...] --check "<shell>" [--runs 3] [--fixture <dir>] [--allow tools] [--model m]')
    return 2
  }
  const skillName = basename(skillDir) + NAME_SUFFIX
  const work = mkdtempSync(join(tmpdir(), 'verify-skill-'))
  const jobs = prompts.flatMap((prompt, p) =>
    Array.from({ length: opts.runs }, async (_, r) => {
      const dir = join(work, `p${p + 1}-r${r + 1}`)
      prepareRepo({ dir, fixture: opts.fixture, skillDir, skillName })
      const transcript = await runSession({ dir, prompt, allow: opts.allow, model: opts.model, skillName })
      writeFileSync(`${dir}.jsonl`, transcript)
      return { prompt, loaded: skillLoaded(transcript, skillName), checked: passesCheck(dir, opts.check) }
    }),
  )
  const result = summarize(await Promise.all(jobs))
  console.log(`work dir: ${work}`)
  for (const row of result.byPrompt) {
    console.log(`loaded ${row.loaded}/${row.runs}  check ${row.checked}/${row.runs}  ${row.prompt}`)
  }
  console.log(result.pass ? 'PASS' : 'FAIL')
  return result.pass ? 0 : 1
}

// realpath: ~/.pi/agent/skills symlinks here, so argv[1] is the link, not this file.
if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)))
