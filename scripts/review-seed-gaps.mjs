#!/usr/bin/env node
// Which judgment rules of CODING_STANDARDS.md no review seed tests. A rule counts as covered when
// some seed's `covers` text (a substring of the rule, see review-seeds/README.md) appears in it.
//   review-seed-gaps [--standards <file>] [--seeds-dir <dir>] [--allow <file>]
// review-seeds/uncovered.json lists rules left unseeded on purpose: [{ "match": "<substring>", "reason": "..." }].
// Exits 1 when a rule is uncovered and not allowed, or an allowlist entry matches no rule (it went stale).
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSeeds } from './review-seeds.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const normalize = (text) => text.replace(/`/g, '').replace(/\s+/g, ' ').toLowerCase()

// Rules a reviewer judges: `review` and `tool`+`review`. `tool`, `process` and `hint` need no seed.
export function reviewRules(standardsText) {
  const rules = []
  let section = ''
  for (const line of standardsText.split('\n')) {
    const heading = line.match(/^#{2,3}\s+(.*)/)
    if (heading) section = heading[1].trim()
    const rule = line.match(/^- `(review|tool)`(\+`review`)?\s+(.*)$/)
    if (rule && (rule[1] === 'review' || rule[2])) rules.push({ section, text: rule[3] })
  }
  return rules
}

export function uncoveredRules(rules, seeds, allowlist) {
  const covers = seeds.map((seed) => seed.covers).filter(Boolean).map(normalize)
  const matches = (rule, needle) => normalize(rule.text).includes(normalize(needle))
  const open = rules.filter((rule) => !covers.some((cover) => normalize(rule.text).includes(cover)) && !allowlist.some((entry) => matches(rule, entry.match)))
  return Object.assign(open, { stale: allowlist.filter((entry) => !rules.some((rule) => matches(rule, entry.match))).map((entry) => entry.match) })
}

function main(argv) {
  const opts = { standards: join(ROOT, 'CODING_STANDARDS.md'), seedsDir: join(ROOT, 'review-seeds', 'seeds'), allow: join(ROOT, 'review-seeds', 'uncovered.json') }
  for (let i = 0; i < argv.length; i += 2) {
    const key = { '--standards': 'standards', '--seeds-dir': 'seedsDir', '--allow': 'allow' }[argv[i]]
    if (!key) throw new Error(`unknown flag ${argv[i]}`)
    opts[key] = resolve(argv[i + 1])
  }
  const rules = reviewRules(readFileSync(opts.standards, 'utf8'))
  const result = uncoveredRules(rules, loadSeeds(opts.seedsDir), JSON.parse(readFileSync(opts.allow, 'utf8')))
  for (const rule of result) console.log(`uncovered [${rule.section}] ${rule.text.slice(0, 110)}`)
  for (const match of result.stale) console.log(`stale allowlist entry matches no rule: ${match}`)
  console.log(`${rules.length - result.length} of ${rules.length} judgment rules covered or excused, ${result.length} open`)
  return result.length || result.stale.length ? 1 : 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (err) {
    console.error(err.message)
    process.exitCode = 2
  }
}
