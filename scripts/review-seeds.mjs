#!/usr/bin/env node
// Regression suite for the agent review prompt in .github/workflows/pr-review.yml.
// Replays seeded PRs (review-seeds/seeds.json: branches in a target repo, each
// breaking one standard, plus clean controls) through the prompt offline with
// `claude -p`, and checks the verdict against what each seed should get.
//   review-seeds --repo <checkout holding the seed branches>
//                [--workflow <pr-review.yml>] [--seeds <file>] [--only a,b] [--model <id>] [--repeat N]
//                [--jobs N] [--out <dir>]
// --workflow tests a prompt change before it merges (default: this repo's own file).
// --seeds replays another list (a seed may set `base` to diff against something other than origin/main,
// e.g. a merged PR's first parent, to check clean history for false positives); --out saves each review.
// --model defaults to the workflow's pinned model. --repeat runs each seed N times; the review is probabilistic, so one run proves little.
// Exits 1 when a run misses its expectation, 2 when none missed but some runs gave no
// verdict (usage limit hit, claude crashed): an error is not a miss, the review never ran.
// Needs the `claude` CLI and the seed
// branches fetched as origin/<branch>. Dry run only: nothing is posted anywhere.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SEEDS_FILE = join(ROOT, 'review-seeds', 'seeds.json')
const DEFAULT_WORKFLOW = join(ROOT, '.github', 'workflows', 'pr-review.yml')
const DEFAULT_JOBS = 4
const RUN_TIMEOUT_MS = 600_000
const PROMPT_INDENT = 12
const ALLOWED_TOOLS = 'Bash(git diff:*),Bash(git show:*),Bash(git log:*),Read,Glob,Grep'
const BLOCK_LABEL = 'agent-changes-requested'
const HUMAN_LABEL = 'needs-human'
const BASE = 'origin/main'

// The model the review workflow pins (its `model` input default), so the suite
// tests the prompt on the model CI runs it on.
export function extractModel(workflowYaml) {
  const match = workflowYaml.match(/\n {6}model:\n(?: {8}.*\n)*? {8}default: (\S+)/)
  if (!match) throw new Error('no model input default found in the workflow')
  return match[1]
}

// The prompt block of the claude-code-action step, dedented, with the workflow
// expressions filled in and standards paths pointed at this checkout.
export function extractPrompt(workflowYaml, { repository = 'owner/repo', number = 0, agentConfigDir = ROOT } = {}) {
  const start = workflowYaml.indexOf('prompt: |\n')
  const end = workflowYaml.indexOf('claude_args:', start)
  if (start === -1 || end === -1) throw new Error('no prompt block found in the workflow')
  const indent = ' '.repeat(PROMPT_INDENT)
  return workflowYaml
    .slice(start + 'prompt: |\n'.length, end)
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(PROMPT_INDENT) : line))
    .join('\n')
    .replaceAll('.agent-config/', `${agentConfigDir}/`)
    .replaceAll('${{ github.repository }}', repository)
    .replaceAll('${{ github.event.pull_request.number }}', String(number))
    .trimEnd()
}

export function buildSimPrompt(prompt, { branch, body = '', base = BASE }) {
  return [
    `SIMULATION: offline dry run of the review prompt below. Do not post comments or edit labels. You cannot run gh. The PR is branch origin/${branch} against ${base}: get its diff with`,
    `  git diff ${base}...origin/${branch} -- . ':(exclude).github/workflows/pr-review.yml'`,
    `read changed files with \`git show origin/${branch}:<path>\`. Where the prompt says \`gh pr view --json commits\`, use \`git log --format=%s ${base}..origin/${branch}\` (the commit headlines). Ignore the workflow-file change entirely.`,
    body ? `PR body: ${body}` : 'The PR body is empty.',
    "Answer exactly as the prompt instructs for the summary comment, and finish with one line: LABELS: <add/remove list as the prompt's Labels section would apply>.",
    '',
    '--- PROMPT ---',
    prompt,
  ].join('\n')
}

// The review's closing LABELS line: which labels it would add. null when missing.
export function parseLabels(output) {
  const lines = output.split('\n').filter((line) => /^\s*LABELS:/i.test(line))
  const last = lines.at(-1)
  if (!last) return null
  const adds = last
    .replace(/^\s*LABELS:/i, '')
    .split(';')
    .filter((part) => /^\s*add\b/i.test(part))
    .join(' ')
  return { blocking: adds.includes(BLOCK_LABEL), needsHuman: adds.includes(HUMAN_LABEL) }
}

// needsHuman is only checked when a seed states it: most seeds don't pin it.
export function judge(expect, got) {
  if (!got) return false
  if (got.blocking !== expect.blocking) return false
  return expect.needsHuman === undefined || got.needsHuman === expect.needsHuman
}

// The Claude Code usage-limit notice ("You've hit your session limit · resets 4:40pm"), or null.
export function limitNotice(output) {
  const line = output.split('\n').find((l) => /hit your .*limit/i.test(l))
  return line ? line.trim() : null
}

// ok / miss / error for one run. A run with no LABELS line has no verdict to judge.
export function classifyRun(expect, output) {
  const got = parseLabels(output)
  if (!got) return { status: 'error', got, notice: limitNotice(output) }
  return { status: judge(expect, got) ? 'ok' : 'miss', got, notice: null }
}

function runClaude(promptText, { repo, model }) {
  return new Promise((resolveRun) => {
    const child = spawn('claude', ['-p', '--model', model, '--allowedTools', ALLOWED_TOOLS], {
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: RUN_TIMEOUT_MS,
    })
    let out = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('close', () => resolveRun(out))
    child.on('error', () => resolveRun(out))
    child.stdin.end(promptText)
  })
}

async function pool(tasks, jobs) {
  const results = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker))
  return results
}

function describe(got) {
  if (!got) return 'no-labels'
  return `${got.blocking ? 'block' : 'pass'}${got.needsHuman ? '+nh' : ''}`
}

function parseArgs(argv) {
  const opts = { seeds: SEEDS_FILE, out: null, workflow: DEFAULT_WORKFLOW, model: null, repeat: 1, jobs: DEFAULT_JOBS, only: null, repo: null }
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (flag === '--repo') opts.repo = resolve(value)
    else if (flag === '--workflow') opts.workflow = resolve(value)
    else if (flag === '--model') opts.model = value
    else if (flag === '--repeat') opts.repeat = Number(value)
    else if (flag === '--jobs') opts.jobs = Number(value)
    else if (flag === '--seeds') opts.seeds = resolve(value)
    else if (flag === '--out') opts.out = resolve(value)
    else if (flag === '--only') opts.only = value.split(',')
    else throw new Error(`unknown flag ${flag}`)
  }
  if (!opts.repo) throw new Error('--repo <checkout holding the seed branches> is required')
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const seeds = JSON.parse(readFileSync(opts.seeds, 'utf8')).filter((s) => !opts.only || opts.only.includes(s.name))
  if (opts.out) mkdirSync(opts.out, { recursive: true })
  const workflow = readFileSync(opts.workflow, 'utf8')
  const prompt = extractPrompt(workflow)
  opts.model ??= extractModel(workflow)
  const tasks = seeds.flatMap((seed) =>
    Array.from({ length: opts.repeat }, (_, run) => async () => {
      const output = await runClaude(buildSimPrompt(prompt, seed), opts)
      if (opts.out) writeFileSync(join(opts.out, `${seed.name}-${run + 1}.txt`), output)
      return { seed, ...classifyRun(seed.expect, output) }
    }),
  )
  const results = await pool(tasks, opts.jobs)
  for (const seed of seeds) {
    const marks = results.filter((r) => r.seed === seed).map((r) => `${r.status === 'error' ? 'ERR' : r.status === 'ok' ? 'ok' : 'MISS'}:${describe(r.got)}`)
    console.log(`${seed.name.padEnd(36)} ${seed.rule.padEnd(40)} ${marks.join(' ')}`)
  }
  const count = (status) => results.filter((r) => r.status === status).length
  const notice = results.find((r) => r.notice)?.notice
  if (notice) console.log(`\n${notice}`)
  console.log(`\n${count('ok')}/${results.length} runs matched, ${count('miss')} missed, ${count('error')} without a verdict (${opts.model}, ${opts.repeat}x)`)
  process.exit(count('miss') ? 1 : count('error') ? 2 : 0)
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
