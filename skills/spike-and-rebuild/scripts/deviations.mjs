#!/usr/bin/env node
// Evidence for a spike review: everything the spike changed relative to the
// committed plan, pulled from git rather than from the spike author's account.
//
// usage: deviations.mjs --feature <name> --base <ref> --plan <ref> --spike <ref>
//   base:  commit before the plan (usually main)
//   plan:  commit holding the type stubs + docs/spikes/<feature>/TODO.md
//   spike: tip of the throwaway spike branch
// Prints a markdown checklist; every item must be answered in the write-up.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SPIKE_DOCS = 'docs/spikes/'

// Order matters: a line can carry several markers; each is reported.
const MARKERS = [
  ['SPIKE-HACK', /SPIKE-HACK/],
  ['TODO', /\bTODO\b/],
  ['FIXME', /\bFIXME\b/],
  ['as any', /\bas any\b/],
  ['@ts-ignore', /@ts-ignore/],
  ['@ts-expect-error', /@ts-expect-error/],
  ['eslint-disable', /eslint-disable/],
  ['type: ignore', /#\s*type:\s*ignore/],
  ['noqa', /#\s*noqa/],
]

const PATH_IN_BULLET = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?`?([\w./@-]+\.[\w]+|[\w./@-]+\/)`?/

export function parseTodoPaths(todoMarkdown) {
  return todoMarkdown
    .split('\n')
    .map((line) => line.match(PATH_IN_BULLET)?.[1])
    .filter(Boolean)
}

export function findAddedMarkers(unifiedDiff) {
  const found = []
  let file = null
  let line = 0
  for (const raw of unifiedDiff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '')
      continue
    }
    const hunk = raw.match(/^@@ -\S+ \+(\d+)/)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (raw.startsWith('+')) {
      const text = raw.slice(1).trim()
      for (const [kind, pattern] of MARKERS) if (pattern.test(text)) found.push({ file, line, kind, text })
      line++
    } else if (raw.startsWith(' ')) {
      line++
    }
  }
  return found
}

export function classifyTouchedFiles({ spikeFiles, stubFiles, todoPaths, ignorePrefix }) {
  const code = spikeFiles.filter((f) => !f.startsWith(ignorePrefix))
  const stubs = new Set(stubFiles)
  const planned = (f) => todoPaths.some((p) => f === p || (p.endsWith('/') && f.startsWith(p)))
  return {
    stubEdits: code.filter((f) => stubs.has(f)),
    offPlan: code.filter((f) => !stubs.has(f) && !planned(f)),
    untouchedTodos: todoPaths.filter((p) => !code.some((f) => f === p || (p.endsWith('/') && f.startsWith(p)))),
  }
}

const list = (items, render) => (items.length ? items.map((i) => `- [ ] ${render(i)}`).join('\n') : 'none')

export function renderReport({ feature, stubDiff, classification, markers }) {
  return [
    `# Spike evidence: ${feature}`,
    '',
    'Generated from git. Each `[ ]` item needs an entry in the write-up: what changed and why.',
    '',
    '## Stub changes (data structures, interfaces)',
    '',
    stubDiff.trim() ? '```diff\n' + stubDiff.trim() + '\n```' : 'none',
    '',
    '## Files touched but not in TODO.md',
    '',
    list(classification.offPlan, (f) => `\`${f}\``),
    '',
    '## TODO.md entries the spike never touched',
    '',
    list(classification.untouchedTodos, (f) => `\`${f}\``),
    '',
    '## Hacks and escape hatches added',
    '',
    list(markers, (m) => `\`${m.file}:${m.line}\` ${m.kind}: \`${m.text}\``),
    '',
  ].join('\n')
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1]
  for (const key of ['feature', 'base', 'plan', 'spike']) {
    if (!args[key]) throw new Error(`missing --${key}`)
  }
  return args
}

function main(argv) {
  const { feature, base, plan, spike } = parseArgs(argv)
  const names = (range) => git('diff', '--name-only', range).split('\n').filter(Boolean)
  const stubFiles = names(`${base}..${plan}`).filter((f) => !f.startsWith(SPIKE_DOCS))
  const todoPath = `${SPIKE_DOCS}${feature}/TODO.md`
  const todoPaths = parseTodoPaths(git('show', `${plan}:${todoPath}`))
  const classification = classifyTouchedFiles({
    spikeFiles: names(`${plan}..${spike}`),
    stubFiles,
    todoPaths,
    ignorePrefix: SPIKE_DOCS,
  })
  const stubDiff = stubFiles.length ? git('diff', `${plan}..${spike}`, '--', ...stubFiles) : ''
  const markers = findAddedMarkers(git('diff', '-U0', `${plan}..${spike}`, '--', '.', `:!${SPIKE_DOCS}`))
  process.stdout.write(renderReport({ feature, stubDiff, classification, markers }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
