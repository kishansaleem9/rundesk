import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MeetingsService } from './meetings.service'

/**
 * The action-item loop needs a live model, so the extraction itself is proven
 * against a running API with a key rather than here. What is worth pinning
 * without one is the shape of the refusals — a meeting with nothing written in
 * it, and an environment with no key, must both fail clearly rather than
 * returning an empty list that reads like "no action items were found".
 */
describe('MeetingsService.extractActionItems', () => {
  const svc = Object.create(MeetingsService.prototype) as MeetingsService & Record<string, unknown>

  const withMeeting = (row: Record<string, unknown>, aiAvailable: boolean) => {
    ;(svc as any).assertMember = async () => ({ role: 'member' })
    ;(svc as any).load = async () => row
    ;(svc as any).ai = { isAvailable: () => aiAvailable }
    return svc
  }

  it('refuses a meeting with neither notes nor transcript', async () => {
    const s = withMeeting({ id: 'm', title: 'Empty', notes: null, transcript: null }, true)
    await assert.rejects(
      () => s.extractActionItems('ws', 'm', 'u'),
      /no notes or transcript/i,
      'an empty meeting should say so, not return an empty list',
    )
  })

  it('treats whitespace-only notes as empty', async () => {
    const s = withMeeting({ id: 'm', title: 'Blank', notes: '   \n  ', transcript: null }, true)
    await assert.rejects(() => s.extractActionItems('ws', 'm', 'u'), /no notes or transcript/i)
  })

  it('falls back to the transcript when there are no notes', async () => {
    // Reaching the AI check means it accepted the transcript as the source.
    const s = withMeeting({ id: 'm', title: 'Recorded', notes: null, transcript: 'we agreed to ship' }, false)
    await assert.rejects(() => s.extractActionItems('ws', 'm', 'u'), /not configured/i)
  })

  it('says the key is missing rather than returning nothing', async () => {
    const s = withMeeting({ id: 'm', title: 'Sync', notes: 'do the thing', transcript: null }, false)
    await assert.rejects(
      () => s.extractActionItems('ws', 'm', 'u'),
      /AI features are not configured/,
      'a missing key must not look like a meeting with no action items',
    )
  })
})
