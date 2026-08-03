import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PresenceService } from './presence.service'

const NOW = new Date('2026-08-03T12:00:00Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000)

describe('PresenceService.resolveStatus (§A4.8)', () => {
  it('falls back to the heartbeat when no override is set', () => {
    assert.equal(PresenceService.resolveStatus(null, minutesAgo(1), NOW), 'online')
    assert.equal(PresenceService.resolveStatus(null, minutesAgo(10), NOW), 'away')
    assert.equal(PresenceService.resolveStatus(null, minutesAgo(60), NOW), 'offline')
    assert.equal(PresenceService.resolveStatus(null, null, NOW), 'offline')
  })

  it('lets a stated status win over activity — that is the whole point of setting one', () => {
    // Actively typing, but has asked not to be interrupted.
    assert.equal(PresenceService.resolveStatus('busy', minutesAgo(1), NOW), 'busy')
    assert.equal(PresenceService.resolveStatus('offline', minutesAgo(1), NOW), 'offline')
    // Idle, but has declared themselves available.
    assert.equal(PresenceService.resolveStatus('online', minutesAgo(60), NOW), 'online')
  })

  it('ignores a value outside the allowed set rather than leaking it to teammates', () => {
    assert.equal(PresenceService.resolveStatus('lunch', minutesAgo(1), NOW), 'online')
  })
})
