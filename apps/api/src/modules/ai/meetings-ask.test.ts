import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiService } from './ai.service'

/**
 * §2.8 — "Get instant answers and insights from your meetings" (frame `310`).
 *
 * The failure mode worth guarding is not a bad answer, it is a CONFIDENT one
 * about meetings that were never recorded. Someone asking "what did we decide
 * about pricing" and getting a fluent paragraph invented from a title has been
 * actively misled, and nothing on screen distinguishes that from a real answer.
 */

function service(available: boolean, capture: { params?: Record<string, unknown> } = {}) {
  const svc = new AiService({ get: () => (available ? 'test-key' : undefined) } as never, {} as never, {} as never)
  ;(svc as unknown as { assertWithinRateLimit: () => Promise<void> }).assertWithinRateLimit = async () => {}
  ;(svc as unknown as { recordUsage: () => void }).recordUsage = () => {}
  if (available) {
    ;(svc as unknown as { client: unknown }).client = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          capture.params = params
          return { content: [{ type: 'text', text: 'They decided to raise prices in Q3.' }], usage: {} }
        },
      },
    }
  }
  return svc
}

const MEETINGS = [
  {
    title: 'Pricing review',
    startsAt: new Date('2026-08-12T10:00:00Z'),
    notes: 'Agreed to raise prices in Q3.',
    attendees: ['Hamda', 'Leo'],
  },
  { title: 'Standup', startsAt: new Date('2026-08-13T09:00:00Z'), notes: null, attendees: [] },
]

describe('§2.8 asking about your meetings', () => {
  it('answers from the records it was given', async () => {
    const capture: { params?: Record<string, unknown> } = {}
    const result = await service(true, capture).askAboutMeetings('What did we decide?', MEETINGS)
    assert.equal(result.grounded, true)
    assert.match(result.answer, /raise prices/)

    // The records really did reach the model, rather than the question going
    // up alone and the answer being invented.
    const sent = JSON.stringify(capture.params)
    assert.match(sent, /Pricing review/)
    assert.match(sent, /Agreed to raise prices in Q3/)
    assert.match(sent, /2026-08-12/, 'the date was not sent, so the answer cannot cite one')
    assert.match(sent, /Hamda/, 'attendees were not sent')
  })

  it('tells the model to say when a meeting has no notes', async () => {
    // The specific way this misleads: a meeting called "Pricing review" with
    // nothing kept invites the model to describe what was "discussed".
    const capture: { params?: Record<string, unknown> } = {}
    await service(true, capture).askAboutMeetings('What happened?', MEETINGS)
    // `complete()` wraps a long system prompt in a cache_control block, so it
    // arrives as an array rather than the string that was passed in.
    const raw = (capture.params as { system?: unknown })?.system
    // Whitespace-normalised: the prompt is hard-wrapped for readability, so a
    // phrase can straddle a line break. A test that fails when a comment is
    // rewrapped is testing the formatting, not the instruction.
    const system = (
      Array.isArray(raw) ? String((raw[0] as { text?: string })?.text ?? '') : String(raw ?? '')
    ).replace(/\s+/g, ' ')
    assert.match(system, /no notes kept/i)
    assert.match(system, /do not fill the gap/i)
    assert.match(system, /ONLY the records/)
    // And the empty one is passed through as empty rather than omitted.
    assert.match(JSON.stringify(capture.params), /\(no notes were kept\)/)
  })

  it('refuses rather than improvising when there is nothing recorded', async () => {
    const result = await service(true).askAboutMeetings('What did we decide?', [])
    assert.equal(result.grounded, false)
    assert.match(result.answer, /no meetings recorded/i)
    // And it says what to do about it, rather than just declining.
    assert.match(result.answer, /Meeting notes tab/)
  })

  it('says plainly when no model is configured, and how much it could see', async () => {
    const result = await service(false).askAboutMeetings('What did we decide?', MEETINGS)
    assert.equal(result.grounded, false)
    assert.match(result.answer, /2 meeting/)
    assert.match(result.answer, /no model is configured/i)
  })

  it('marks a real answer as grounded and a fallback as not', async () => {
    // `grounded` is what the UI uses to decide whether to present an answer as
    // an answer. Getting it backwards would dress a refusal up as a finding.
    assert.equal((await service(true).askAboutMeetings('x', MEETINGS)).grounded, true)
    assert.equal((await service(true).askAboutMeetings('x', [])).grounded, false)
    assert.equal((await service(false).askAboutMeetings('x', MEETINGS)).grounded, false)
  })
})
