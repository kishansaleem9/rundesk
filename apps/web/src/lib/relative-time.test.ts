import assert from 'node:assert/strict'
import { test } from 'node:test'
import { relativeTime, exactTime } from './relative-time'

/**
 * The bug this file exists to prevent shipped for a long time in plain sight:
 * one copy of "how long ago" was locale-aware and another hardcoded English,
 * so readers in Arabic and Urdu saw "3d ago" in the docs panel while the list
 * showed them "منذ ٣ أيام".
 */

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()

test('it speaks the reader’s language, which is the whole point', () => {
  const threeDays = ago(3 * 86400)
  const en = relativeTime(threeDays, 'en')
  const ar = relativeTime(threeDays, 'ar')
  assert.notEqual(en, ar, 'Arabic and English produced identical text — something is hardcoded')
  // Arabic must not be rendered in Latin script; that is exactly the old bug.
  assert.ok(/[؀-ۿ]/.test(ar), `Arabic came back as ${JSON.stringify(ar)}`)
})

test('recent things read as idiomatic, not arithmetic', () => {
  // numeric:'auto' is what turns "1 day ago" into "yesterday".
  assert.equal(relativeTime(ago(86400), 'en'), 'yesterday')
})

test('it picks a unit a person would use', () => {
  assert.match(relativeTime(ago(45), 'en'), /second/)
  assert.match(relativeTime(ago(300), 'en'), /minute/)
  assert.match(relativeTime(ago(7200), 'en'), /hour/)
  assert.match(relativeTime(ago(60 * 86400), 'en'), /month/)
})

test('a broken timestamp shows nothing, not "Invalid Date ago"', () => {
  // A bad row should look empty, not like a bug report waiting to be filed.
  assert.equal(relativeTime('not a date', 'en'), '')
  assert.equal(exactTime('not a date', 'en'), '')
})

test('the exact time is still available for citing', () => {
  // Relative is easier to read and useless for settling when something
  // happened, so both exist and the exact one goes in the title attribute.
  assert.ok(exactTime(ago(3600), 'en').length > 0)
})
