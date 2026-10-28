#!/usr/bin/env node
// Merges the missing lines of a template ignore file into an existing one (init-repo step 4):
//   node merge-missing-lines.mjs <template-file> <target-file>
// Appends each template pattern the target lacks (compared after trimming trailing spaces;
// blank lines and comments are never copied) under one comment line, and leaves every
// existing line where it is. Works for .gitignore and .prettierignore.
// Order matters in ignore files: a later pattern overrides an earlier negation (`!.env.example`).
// The merge warns when it appends a pattern after a negation the target already has; check
// with `git check-ignore -v .env.example` after merging: the rule it prints must start with `!`
// (it exits 0 for a negated match too, so read the rule, not the exit code).
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HEADER = '# added by /init-repo from the template'
const patterns = (text) => text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line && !line.startsWith('#'))

/**
 * @param {string} template contents of the template file
 * @param {string} target contents of the existing file ('' when it has none)
 * @returns {{ text: string, added: string[], warnings: string[] }} the merged text, the patterns appended, and order warnings
 */
export function mergeMissingLines(template, target) {
  const present = new Set(patterns(target))
  const added = patterns(template).filter((line, index, all) => !present.has(line) && all.indexOf(line) === index)
  if (!added.length) return { text: target, added, warnings: [] }
  const eol = target.includes('\r\n') ? '\r\n' : '\n'
  const lead = target === '' || target.endsWith('\n') ? '' : eol
  const text = `${target}${lead}${[HEADER, ...added].join(eol)}${eol}`
  const hasNegation = [...present].some((line) => line.startsWith('!'))
  const warnings =
    hasNegation && added.some((line) => !line.startsWith('!'))
      ? ['the target has negation (!) lines above the appended patterns; one may now be overridden, so check the order']
      : []
  return { text, added, warnings }
}

function main([templatePath, targetPath]) {
  if (!templatePath || !targetPath) {
    console.error('usage: merge-missing-lines.mjs <template-file> <target-file>')
    return 2
  }
  let target = ''
  try {
    target = readFileSync(targetPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const { text, added, warnings } = mergeMissingLines(readFileSync(templatePath, 'utf8'), target)
  if (added.length) writeFileSync(targetPath, text)
  console.log(`${targetPath}: added ${added.length} line(s)${added.length ? `: ${added.join(' ')}` : ''}`)
  for (const warning of warnings) console.error(`warning: ${warning}`)
  return 0
}

// realpath: ~/.claude/skills symlinks here, so argv[1] is the link, not this file.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
