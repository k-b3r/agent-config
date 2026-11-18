import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renameSkill, skillLoaded, summarize } from './verify-skill.mjs'

const line = (obj) => JSON.stringify(obj)
const readCall = (path, toolName = 'read') => line({ type: 'tool_execution_start', toolCallId: 'c1', toolName, args: { path } })

test('skillLoaded is true when the transcript has a read of that skill\'s SKILL.md', () => {
  const transcript = [line({ type: 'agent_start' }), readCall('/tmp/run/.verify-skills/release-notes-verify/SKILL.md')].join('\n')
  assert.equal(skillLoaded(transcript, 'release-notes-verify'), true)
})

test('skillLoaded is false for another skill, another file of the skill, or a non-read tool', () => {
  assert.equal(skillLoaded(readCall('/x/.verify-skills/tdd/SKILL.md'), 'release-notes-verify'), false)
  assert.equal(skillLoaded(readCall('/x/release-notes-verify/REFERENCE.md'), 'release-notes-verify'), false)
  assert.equal(skillLoaded(readCall('/x/release-notes-verify/SKILL.md', 'write'), 'release-notes-verify'), false)
  assert.equal(skillLoaded(line({ type: 'message_end', message: { content: '/x/release-notes-verify/SKILL.md' } }), 'release-notes-verify'), false)
})

test('skillLoaded skips lines that are not JSON, such as CLI warnings', () => {
  const transcript = ['warning: something', readCall('/a/x/SKILL.md')].join('\n')
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
