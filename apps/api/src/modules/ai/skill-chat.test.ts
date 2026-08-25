import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiService } from './ai.service'

/**
 * §15 — a skill has to actually reach the model, or the whole feature is a CRUD
 * app for text that never changes an answer.
 *
 * These tests capture the system prompt `chatStream` hands to Anthropic. Two
 * things matter and neither is visible from the outside: that the skill's own
 * words come *first* (so a default two lines below cannot overrule them), and
 * that a turn without a skill is unchanged from what it was before skills
 * existed.
 */

/** Capture the params of the streamed call without hitting the network. */
function captureStream() {
  const captured: { system?: unknown; model?: string } = {}
  const service = new AiService(
    { get: () => 'test-key' } as never,
    {} as never,
    {} as never,
  )
  // The rate limiter reads the database; this path is not what is under test.
  ;(service as unknown as { assertWithinRateLimit: () => Promise<void> }).assertWithinRateLimit =
    async () => {}
  ;(service as unknown as { recordUsage: () => void }).recordUsage = () => {}
  ;(service as unknown as { client: unknown }).client = {
    messages: {
      stream: (params: { system?: unknown; model?: string }) => {
        captured.system = params.system
        captured.model = params.model
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }
          },
          finalMessage: async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }),
        }
      },
    },
  }

  // Fastify-shaped response: hijack + reply.raw, as the real handler receives.
  const written: string[] = []
  const res = {
    hijack: () => {},
    raw: {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (chunk: string) => written.push(chunk),
      end: () => {},
    },
  }
  const systemText = () => {
    const system = captured.system
    if (Array.isArray(system)) return String((system[0] as { text?: string })?.text ?? '')
    return String(system ?? '')
  }
  return { service, res, written, systemText }
}

const MESSAGES = [{ role: 'user' as const, content: 'draft the handover note' }]
const CONTEXT = 'Workspace: Acme\nYour role: member'

const SKILL_PROMPT = [
  'You are answering as the "Delegate Like Me" skill.',
  '',
  'You hand work off the way I do.',
  '',
  'What this skill has been told before (most recent first) — treat it as',
  'established and do not ask again:',
  '- Hamda owns anything client-facing',
  '',
  'You shape this reply; you do not take actions on your own. If the answer',
  'implies doing something, say what you would do and let the person decide.',
].join('\n')

describe('§15 a skill reaches the model', () => {
  it('puts the skill ahead of the generic assistant description', async () => {
    const { service, res, systemText } = captureStream()
    await service.chatStream(MESSAGES, CONTEXT, res as never, {}, SKILL_PROMPT)
    const system = systemText()

    // First, so nothing below it can quietly override the skill's own wording.
    assert.ok(
      system.startsWith('You are answering as the "Delegate Like Me" skill.'),
      `skill prompt was not first:\n${system.slice(0, 200)}`,
    )
    assert.match(system, /You hand work off the way I do\./)
    // Memory travels with it, or "never explain it again" is not true.
    assert.match(system, /Hamda owns anything client-facing/)
    // The boundary survives the assembly.
    assert.match(system, /do not take actions on your own/)
    // And the workspace grounding is still there — a skill narrows the voice,
    // it does not cost the model its knowledge of the workspace.
    assert.match(system, /Workspace: Acme/)
  })

  it('replaces the generic description rather than stacking it', async () => {
    // Both present would give the model two personas and let the generic
    // "be concise, action-oriented" cut across a skill that asked for the
    // opposite.
    const { service, res, systemText } = captureStream()
    await service.chatStream(MESSAGES, CONTEXT, res as never, {}, SKILL_PROMPT)
    assert.doesNotMatch(systemText(), /You are Rundesk AI, an intelligent assistant/)
  })

  it('leaves an ordinary turn exactly as it was', async () => {
    const { service, res, systemText } = captureStream()
    await service.chatStream(MESSAGES, CONTEXT, res as never, {})
    const system = systemText()
    assert.match(system, /^You are Rundesk AI, an intelligent assistant embedded in the Rundesk/)
    assert.match(system, /Workspace context:\nWorkspace: Acme/)
    assert.doesNotMatch(system, /answering as the/)
  })

  it('ignores a blank skill prompt instead of shipping an empty persona', async () => {
    const { service, res, systemText } = captureStream()
    await service.chatStream(MESSAGES, CONTEXT, res as never, {}, '   ')
    assert.match(systemText(), /^You are Rundesk AI, an intelligent assistant/)
  })

  it('still streams the answer through', async () => {
    const { service, res, written } = captureStream()
    await service.chatStream(MESSAGES, CONTEXT, res as never, {}, SKILL_PROMPT)
    assert.ok(written.some((chunk) => chunk.includes('"delta":"hi"')))
    assert.ok(written.some((chunk) => chunk.includes('[DONE]')))
  })
})
