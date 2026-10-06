import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renameSkill, skillLoaded, summarize } from './verify-skill.mjs'

const line = (obj) => JSON.stringify(obj)
const skillCall = (skill) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } })

test('skillLoaded is true when the transcript has a Skill tool call for that skill', () => {
  const transcript = [line({ type: 'system', tools: ['Skill', 'Bash'] }), skillCall('release-notes-verify')].join('\n')
  assert.equal(skillLoaded(transcript, 'release-notes-verify'), true)
})

test('skillLoaded is false when only another skill was called, or the tool list merely names Skill', () => {
  const transcript = [line({ type: 'system', tools: ['Skill'] }), skillCall('tdd')].join('\n')
  assert.equal(skillLoaded(transcript, 'release-notes-verify'), false)
})

test('skillLoaded skips lines that are not JSON, such as CLI warnings', () => {
  const transcript = ['warning: something', skillCall('x')].join('\n')
  assert.equal(skillLoaded(transcript, 'x'), true)
})

test('renameSkill rewrites the frontmatter name so the copy under test cannot be confused with an installed one', () => {
  const md = '---\nname: release-notes\ndescription: "Use when..."\n---\n\n# Release notes\nname: stays\n'
  assert.equal(
    renameSkill(md, 'release-notes-verify'),
    '---\nname: release-notes-verify\ndescription: "Use when..."\n---\n\n# Release notes\nname: stays\n',
  )
})

test('summarize passes only when every run loaded the skill and passed the check', () => {
  const runs = [
    { prompt: 'p1', loaded: true, checked: true },
    { prompt: 'p1', loaded: true, checked: false },
    { prompt: 'p2', loaded: false, checked: false },
  ]
  const result = summarize(runs)
  assert.equal(result.pass, false)
  assert.deepEqual(result.byPrompt, [
    { prompt: 'p1', runs: 2, loaded: 2, checked: 1 },
    { prompt: 'p2', runs: 1, loaded: 0, checked: 0 },
  ])
})

test('summarize passes when all runs loaded and checked', () => {
  assert.equal(summarize([{ prompt: 'p', loaded: true, checked: true }]).pass, true)
})
