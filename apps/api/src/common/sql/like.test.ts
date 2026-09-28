import { test } from 'node:test'
import assert from 'node:assert/strict'
import { likeContaining } from './like'

test('escapes the two wildcards and the escape itself, and wraps the text', () => {
  assert.equal(likeContaining('50%'), '%50\\%%')
  assert.equal(likeContaining('a_b'), '%a\\_b%')
  assert.equal(likeContaining('back\\slash'), '%back\\\\slash%')
  assert.equal(likeContaining('plain'), '%plain%')
})
