import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFree, mergeBusy, toBusyWindows, type BusyWindow } from './free-busy'

/**
 * §V2-14c — "These calendars decide when you're busy."
 *
 * These checks are about the two things that make a free/busy view either
 * useful or actively harmful: that it does not invent time somebody is busy,
 * and that it does not say WHAT they are doing.
 */

const w = (startsAt: string, endsAt: string, source: 'rundesk' | 'external' = 'rundesk'): BusyWindow =>
  ({ startsAt, endsAt, source })

test('a busy window has no room for a title', () => {
  /*
   * THE PRIVACY RULE, asserted on the SHAPE rather than on a value. Somebody's
   * personal calendar says things like "MRI results". A colleague may know
   * they are busy at three; they may not know why. Because the type carries no
   * title, no call site can leak one by forgetting to strip it — and this
   * check fails the moment somebody adds the field.
   */
  const [one] = toBusyWindows(
    [{ start: '2026-03-04T09:00:00Z', end: '2026-03-04T10:00:00Z' }],
    'external',
  )
  assert.deepEqual(Object.keys(one).sort(), ['endsAt', 'source', 'startsAt'])
})

test('what a provider returns is trusted only when it makes sense', () => {
  const out = toBusyWindows(
    [
      { start: '2026-03-04T09:00:00Z', end: '2026-03-04T10:00:00Z' }, // fine
      { start: '2026-03-04T11:00:00Z', end: null },                    // no end
      { start: null, end: '2026-03-04T12:00:00Z' },                    // no start
      { start: '2026-03-04T14:00:00Z', end: '2026-03-04T13:00:00Z' },  // backwards
      { start: '2026-03-04T15:00:00Z', end: '2026-03-04T15:00:00Z' },  // instant
      { start: 'not a date', end: 'also not' },
    ],
    'external',
  )
  // Dropped, not repaired: guessing a duration would draw a block on somebody's
  // calendar that nothing in the world corresponds to.
  assert.equal(out.length, 1)
  assert.equal(out[0].startsAt, '2026-03-04T09:00:00.000Z')
})

test('overlapping busy time is one window, not two', () => {
  const merged = mergeBusy([
    w('2026-03-04T09:00:00.000Z', '2026-03-04T10:30:00.000Z'),
    w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'external'),
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].startsAt, '2026-03-04T09:00:00.000Z')
  assert.equal(merged[0].endsAt, '2026-03-04T11:00:00.000Z')
})

test('back-to-back meetings leave no free minute between them', () => {
  // 2–3 and 3–4 is one solid block. Reporting a gap at three would offer a
  // free minute that does not exist.
  const merged = mergeBusy([
    w('2026-03-04T14:00:00.000Z', '2026-03-04T15:00:00.000Z'),
    w('2026-03-04T15:00:00.000Z', '2026-03-04T16:00:00.000Z'),
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].endsAt, '2026-03-04T16:00:00.000Z')
})

test('separate busy time stays separate', () => {
  const merged = mergeBusy([
    w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z'),
    w('2026-03-04T14:00:00.000Z', '2026-03-04T15:00:00.000Z'),
  ])
  assert.equal(merged.length, 2)
})

test('merging sorts, so windows may arrive in any order', () => {
  const merged = mergeBusy([
    w('2026-03-04T14:00:00.000Z', '2026-03-04T15:00:00.000Z'),
    w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z'),
  ])
  assert.equal(merged[0].startsAt, '2026-03-04T09:00:00.000Z')
})

test('a window swallowed by a longer one does not extend it', () => {
  const merged = mergeBusy([
    w('2026-03-04T09:00:00.000Z', '2026-03-04T17:00:00.000Z'),
    w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'external'),
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].endsAt, '2026-03-04T17:00:00.000Z')
})

test('a joined window that includes Rundesk time is not called external', () => {
  // The UI draws the two differently, and calling mixed time "external" would
  // hide work this product can actually explain behind an opaque block.
  const merged = mergeBusy([
    w('2026-03-04T09:00:00.000Z', '2026-03-04T10:30:00.000Z', 'external'),
    w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'rundesk'),
  ])
  assert.equal(merged[0].source, 'rundesk')
})

test('all-external time keeps saying so', () => {
  const merged = mergeBusy([
    w('2026-03-04T09:00:00.000Z', '2026-03-04T10:30:00.000Z', 'external'),
    w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'external'),
  ])
  assert.equal(merged[0].source, 'external')
})

test('nothing in the diary means free', () => {
  assert.equal(isFree([], '2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z'), true)
})

test('a meeting that ends when yours starts does not block it', () => {
  // Half-open, the same convention the planner's own block range uses.
  const busy = [w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z')]
  assert.equal(isFree(busy, '2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z'), true)
  assert.equal(isFree(busy, '2026-03-04T08:00:00.000Z', '2026-03-04T09:00:00.000Z'), true)
})

test('any overlap at all means not free', () => {
  const busy = [w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z')]
  // Starts inside, ends inside, spans it, and sits within it.
  assert.equal(isFree(busy, '2026-03-04T09:30:00.000Z', '2026-03-04T10:30:00.000Z'), false)
  assert.equal(isFree(busy, '2026-03-04T08:30:00.000Z', '2026-03-04T09:30:00.000Z'), false)
  assert.equal(isFree(busy, '2026-03-04T08:00:00.000Z', '2026-03-04T11:00:00.000Z'), false)
  assert.equal(isFree(busy, '2026-03-04T09:15:00.000Z', '2026-03-04T09:45:00.000Z'), false)
})
