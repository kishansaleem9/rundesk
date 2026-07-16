import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeBriefingPrefs } from './notifications.service'

/**
 * §7.11 — the profile Notifications tab patches `briefing: { enabled, hour }`
 * onto notification_preferences, and the cron reads it back. This locks down the
 * shared normalizer (default disabled/08:00, hour clamped to 0–23) so the patch
 * path and the due-hour selection agree.
 */
describe('normalizeBriefingPrefs (§7.11)', () => {
  it('defaults to disabled at hour 8', () => {
    assert.deepEqual(normalizeBriefingPrefs(undefined), { enabled: false, hour: 8 })
    assert.deepEqual(normalizeBriefingPrefs(null), { enabled: false, hour: 8 })
    assert.deepEqual(normalizeBriefingPrefs({}), { enabled: false, hour: 8 })
  })

  it('only enables on a strict boolean true', () => {
    assert.equal(normalizeBriefingPrefs({ enabled: true }).enabled, true)
    assert.equal(normalizeBriefingPrefs({ enabled: 'yes' }).enabled, false)
    assert.equal(normalizeBriefingPrefs({ enabled: 1 }).enabled, false)
  })

  it('clamps the hour to 0..23 and truncates fractions', () => {
    assert.equal(normalizeBriefingPrefs({ hour: 0 }).hour, 0)
    assert.equal(normalizeBriefingPrefs({ hour: 23 }).hour, 23)
    assert.equal(normalizeBriefingPrefs({ hour: 30 }).hour, 23)
    assert.equal(normalizeBriefingPrefs({ hour: -5 }).hour, 0)
    assert.equal(normalizeBriefingPrefs({ hour: 9.8 }).hour, 9)
  })

  it('falls back to hour 8 on a non-numeric hour', () => {
    assert.equal(normalizeBriefingPrefs({ hour: 'noon' }).hour, 8)
  })
})
