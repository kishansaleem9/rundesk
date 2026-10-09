import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clipTokenOf, clipTokensIn, MAX_CLIP_EMBEDS } from './clip-links'

const ORIGIN = 'https://app.rundesk.test'
const T1 = 'a'.repeat(30) + '_-'
const T2 = 'B1c2D3e4F5g6H7i8J9k0L1m2N3o4P5q6'

test('a clip’s link on this site names its clip', () => {
  assert.equal(clipTokenOf(`${ORIGIN}/clips/${T1}`, ORIGIN), T1)
  assert.equal(clipTokenOf(`/clips/${T2}`, ORIGIN), T2)
  assert.equal(clipTokenOf(`${ORIGIN}/clips/${T1}.`, ORIGIN), T1, 'a full stop after it is the sentence’s')
})

test('another site’s page, or a token of another shape, is no clip', () => {
  assert.equal(clipTokenOf(`https://elsewhere.test/clips/${T1}`, ORIGIN), null)
  assert.equal(clipTokenOf(`${ORIGIN}/clips/short`, ORIGIN), null)
  assert.equal(clipTokenOf(`${ORIGIN}/clips/${T1}/edit`, ORIGIN), null)
  assert.equal(clipTokenOf(`${ORIGIN}/app/w/clips`, ORIGIN), null)
})

test('a text’s clips, each once, in order, and no more than are drawn', () => {
  const text = `see ${ORIGIN}/clips/${T1} and https://elsewhere.test/clips/${T2}, then /clips/${T2} and ${ORIGIN}/clips/${T1} again`
  assert.deepEqual(clipTokensIn(text, ORIGIN), [T1, T2])
  const many = Array.from({ length: MAX_CLIP_EMBEDS + 2 }, (_, i) => `${ORIGIN}/clips/${String(i).padStart(32, 'x')}`).join(' ')
  assert.equal(clipTokensIn(many, ORIGIN).length, MAX_CLIP_EMBEDS)
  assert.deepEqual(clipTokensIn(null, ORIGIN), [])
})
