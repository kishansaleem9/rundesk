import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeRailOrder, sectionIdOf, sectionKey } from './planner-sections.service'

const A1 = sectionKey('11111111-1111-4111-8111-111111111111')
const B1 = sectionKey('22222222-2222-4222-8222-222222222222')
const B2 = sectionKey('33333333-3333-4333-8333-333333333333')
const foreign = (key: string) => key === B1 || key === B2

test('the order saved from one workspace keeps another workspace’s sections after the key each followed', () => {
  const stored = ['priorities', B1, 'meetWith', A1, 'backlog', B2]
  const next = ['backlog', A1, 'priorities', 'meetWith']
  assert.deepEqual(mergeRailOrder(stored, next, foreign), ['backlog', B2, A1, 'priorities', B1, 'meetWith'])
})

test('one that followed nothing still in the order goes first, and nothing of this workspace is put back', () => {
  const stored = [B1, 'priorities', A1]
  assert.deepEqual(mergeRailOrder(stored, ['meetWith'], foreign), [B1, 'meetWith'])
  assert.deepEqual(mergeRailOrder(stored, ['meetWith'], () => false), ['meetWith'])
})

test('a section’s key names its id, and nothing else is one', () => {
  assert.equal(sectionIdOf(A1), '11111111-1111-4111-8111-111111111111')
  assert.equal(sectionIdOf('section:not-an-id'), null)
  assert.equal(sectionIdOf('backlog'), null)
  assert.equal(sectionIdOf(42), null)
})
