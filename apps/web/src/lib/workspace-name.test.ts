import assert from 'node:assert/strict'
import { test } from 'node:test'
import { characterCount, cleanWorkspaceName, workspaceNameProblem } from './workspace-name'

// QA WS-002 — the form says what the API would refuse, before it sends.

test('blank, spaces and zero-width characters are a blank name', () => {
  for (const raw of ['', '   ', '\u00a0\t\n', '\u200b\u200b']) assert.equal(workspaceNameProblem(raw), 'workspaceName.blank', JSON.stringify(raw))
})

test('one character is too short, an emoji counting as one', () => {
  assert.equal(workspaceNameProblem('A'), 'workspaceName.short')
  assert.equal(workspaceNameProblem(' 🚀 '), 'workspaceName.short')
  assert.equal(workspaceNameProblem('AB'), null)
})

test('sixty characters is the most, counted as a person counts them', () => {
  assert.equal(workspaceNameProblem('x'.repeat(60)), null)
  assert.equal(workspaceNameProblem('x'.repeat(61)), 'workspaceName.long')
  assert.equal(workspaceNameProblem('🚀'.repeat(60)), null)
  assert.equal(workspaceNameProblem('🚀'.repeat(61)), 'workspaceName.long')
  assert.equal(characterCount('👩\u200d💻'), 1)
})

test('the name kept is trimmed and its inner whitespace folded', () => {
  assert.equal(cleanWorkspaceName('  Acme \n\t Ops\u00a0'), 'Acme Ops')
  assert.equal(cleanWorkspaceName('👩\u200d💻 Devs'), '👩\u200d💻 Devs')
})
