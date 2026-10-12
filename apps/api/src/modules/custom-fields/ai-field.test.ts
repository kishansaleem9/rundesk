import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AI_FIELD_BASE, AI_FIELD_KINDS, AiFieldConfigError, aiConfigOf, aiFieldValue, toAiConfig } from './ai-field'

/**
 * ClickUp's AI fields live within Short Text, Long Text and Dropdown
 * (`commit-log/log-c980bee-1`, `ledger-rows/row-719`): each kind in its own
 * type, what each needs, and what an answer may be stored as.
 */

test('each kind lives within the types ClickUp puts it in, and no other', () => {
  for (const kind of AI_FIELD_KINDS) {
    for (const type of ['text', 'long_text', 'dropdown']) {
      const extra = kind === 'translation' ? { language: 'French' } : kind.startsWith('custom') ? { prompt: 'Say it' } : {}
      const ok = (AI_FIELD_BASE[kind] as readonly string[]).includes(type)
      if (ok) assert.equal(toAiConfig(type, { kind, ...extra }).kind, kind)
      else assert.throws(() => toAiConfig(type, { kind, ...extra }), AiFieldConfigError, `${kind} in ${type}`)
    }
  }
  assert.deepEqual(AI_FIELD_BASE.summary, ['long_text'])
  assert.deepEqual(AI_FIELD_BASE.sentiment, ['text'])
  assert.deepEqual(AI_FIELD_BASE.categorize, ['dropdown'])
})

test('an unknown kind, a custom field without its instruction and a translation without its language are refused', () => {
  assert.throws(() => toAiConfig('long_text', { kind: 'poem' }), /one of/)
  assert.throws(() => toAiConfig('text', { kind: 'custom_text' }), /instruction/)
  assert.throws(() => toAiConfig('dropdown', { kind: 'custom_dropdown', prompt: '   ' }), /instruction/)
  assert.throws(() => toAiConfig('long_text', { kind: 'translation' }), /language/)
  assert.throws(() => toAiConfig('text', 'sentiment'), /object/)
})

test('fill settings are on only when asked for', () => {
  assert.deepEqual(toAiConfig('long_text', { kind: 'summary' }), { kind: 'summary', autofill: false, autoUpdate: false })
  assert.deepEqual(toAiConfig('long_text', { kind: 'summary', autofill: true, autoUpdate: 'yes' }), {
    kind: 'summary',
    autofill: true,
    autoUpdate: false,
  })
})

test('a stored config reads as an AI field only on a type an AI field lives within', () => {
  assert.equal(aiConfigOf('long_text', { ai: { kind: 'summary' } })?.kind, 'summary')
  assert.equal(aiConfigOf('number', { ai: { kind: 'summary' } }), null)
  assert.equal(aiConfigOf('long_text', null), null)
  assert.equal(aiConfigOf('text', { ai: { kind: 'summary' } }), null)
})

test('a dropdown stores one of its options, matched by label or value, and refuses any other answer', () => {
  const options = [
    { label: 'Bug', value: 'bug' },
    { label: 'Feature request', value: 'feature_request' },
  ]
  assert.deepEqual(aiFieldValue('dropdown', 'categorize', 'Feature request', options), { value: 'feature_request' })
  assert.deepEqual(aiFieldValue('dropdown', 'categorize', ' "bug". ', options), { value: 'bug' })
  assert.deepEqual(aiFieldValue('dropdown', 'custom_dropdown', 'feature_request', options), { value: 'feature_request' })
  const refused = aiFieldValue('dropdown', 'categorize', 'Purple', options)
  assert.ok('refused' in refused && /not one of this field’s options/.test(refused.refused))
})

test('sentiment is one of its three words; text is one line; nothing is never stored', () => {
  assert.deepEqual(aiFieldValue('text', 'sentiment', 'Negative — the client is unhappy', null), { value: 'Negative' })
  assert.ok('refused' in aiFieldValue('text', 'sentiment', 'Mixed', null))
  assert.deepEqual(aiFieldValue('text', 'custom_text', 'two\nlines', null), { value: 'two lines' })
  assert.deepEqual(aiFieldValue('long_text', 'action_items', '- one\n- two', null), { value: '- one\n- two' })
  assert.ok('refused' in aiFieldValue('long_text', 'summary', '   ', null))
})
