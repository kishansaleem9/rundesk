import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { proposeSkill } from './skills-api'

/**
 * §15 — reading the drafting stream.
 *
 * This parser is the one piece of the flow with a failure mode that looks like
 * success: SSE arrives in arbitrary chunks, and a parser that splits each chunk
 * independently silently DROPS any event straddling a boundary. On a fast local
 * connection every event lands whole and it passes; over a real network a step
 * or the proposal itself vanishes, and the panel just shows less.
 *
 * So the fixtures below deliberately cut events in half.
 */

const STEP_A = { step: { label: "Checking what you're working on", finding: 'Workspace: Acme' } }
const STEP_B = { step: { label: 'Mapping your task habits', finding: '0 item(s)' } }
const RESULT = {
  proposal: {
    name: 'Personal Task Organizer',
    description: 'Captures tasks',
    instructions: 'You organise my work.',
    memories: ['I plan on Mondays'],
    rationale: 'I found a mostly empty personal list.',
    steps: [STEP_A.step, STEP_B.step],
    followUps: ['Add a weekly review'],
  },
  message: "…Approve this approach and I'll create it, or tell me one tweak you want first.",
}

/** Serve `chunks` as the response body, verbatim, in exactly that order. */
function stubFetch(chunks: string[], ok = true, status = 200) {
  const encoder = new TextEncoder()
  ;(globalThis as { fetch?: unknown }).fetch = async () =>
    ({
      ok,
      status,
      clone: () => ({ json: async () => ({ message: 'nope' }) }),
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
    }) as unknown as Response
}

const event = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`

describe('§15 reading the drafting stream', () => {
  it('collects the steps in order, then the proposal', async () => {
    stubFetch([event(STEP_A), event(STEP_B), event(RESULT), 'data: [DONE]\n\n'])
    const seen: string[] = []
    const out = await proposeSkill('ws', 'organise my tasks', {
      onStep: (s) => seen.push(s.label),
    })
    assert.deepEqual(seen, ["Checking what you're working on", 'Mapping your task habits'])
    assert.equal(out.proposal.name, 'Personal Task Organizer')
    assert.match(out.message, /Approve this approach and I'll create it/)
  })

  it('does not drop an event split across two chunks', async () => {
    // The whole reason the parser buffers. Cut every event in half at a
    // different offset so no single boundary is a lucky one.
    const whole = event(STEP_A) + event(STEP_B) + event(RESULT) + 'data: [DONE]\n\n'
    const chunks: string[] = []
    for (let i = 0; i < whole.length; i += 17) chunks.push(whole.slice(i, i + 17))
    stubFetch(chunks)
    const seen: string[] = []
    const out = await proposeSkill('ws', 'organise my tasks', { onStep: (s) => seen.push(s.label) })
    assert.equal(seen.length, 2, `lost a step across chunk boundaries: ${JSON.stringify(seen)}`)
    assert.equal(out.proposal.name, 'Personal Task Organizer')
  })

  it('survives one byte at a time', async () => {
    const whole = event(STEP_A) + event(RESULT) + 'data: [DONE]\n\n'
    stubFetch([...whole])
    const seen: string[] = []
    const out = await proposeSkill('ws', 'x', { onStep: (s) => seen.push(s.label) })
    assert.equal(seen.length, 1)
    assert.equal(out.proposal.name, 'Personal Task Organizer')
  })

  it('raises the server’s reason rather than a generic failure', async () => {
    stubFetch([event({ error: 'This skill is disabled' })])
    await assert.rejects(() => proposeSkill('ws', 'x'), /This skill is disabled/)
  })

  it('says so when the stream ends without a proposal', async () => {
    // Silence here would leave the panel spinning on a request that finished.
    stubFetch([event(STEP_A), 'data: [DONE]\n\n'])
    await assert.rejects(() => proposeSkill('ws', 'x'), /did not come back/i)
  })

  it('ignores a malformed event instead of aborting the draft', async () => {
    stubFetch(['data: {not json}\n\n', event(STEP_A), event(RESULT), 'data: [DONE]\n\n'])
    const out = await proposeSkill('ws', 'x')
    assert.equal(out.proposal.name, 'Personal Task Organizer')
  })

  it('surfaces an HTTP-level refusal', async () => {
    stubFetch([], false, 403)
    await assert.rejects(() => proposeSkill('ws', 'x'), /nope/)
  })
})
