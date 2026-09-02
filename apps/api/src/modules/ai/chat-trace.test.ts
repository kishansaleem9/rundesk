import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'

/**
 * G13-10 [18:33–18:36] — the retrieval trace has to be a record of work.
 *
 * > A "Pondering" status with the retrieval steps streaming beneath it —
 * > "Checking what you're working on", "Checking the latest Skills basics" —
 * > before the answer appears.
 *
 * The panel used to show a blinking caret, so a turn that spent several
 * seconds reading a real workspace looked identical to one doing nothing.
 *
 * What makes a trace worth trusting is that each line corresponds to work that
 * actually happened, in the order it happened. So these tests do not check
 * that steps exist — they check the ORDER of the frames on the wire against
 * the order of the calls, and that a step never appears for work that was
 * skipped. A trace that says "Reading your workspace" on a turn with no
 * workspace would be worse than no trace at all: it would be a lie the user
 * has no way to catch.
 *
 * No Anthropic key is needed, which is the point — this runs in CI, where the
 * live path cannot.
 */

/**
 * A Fastify-shaped reply that records every frame into a SHARED timeline.
 *
 * Shared with the fake collaborators on purpose. A first version kept frames
 * and calls in two separate arrays and asserted things about each — which
 * looked like an ordering check and was not: moving `step('workspace')` to
 * AFTER the await left both arrays identical, and every assertion still
 * passed. One interleaved list is the only thing that can tell "announced
 * then read" from "read then announced".
 */
function recordingRes(timeline: string[]) {
  return {
    res: {
      hijack: () => {},
      raw: {
        setHeader: () => {},
        flushHeaders: () => {},
        write: (chunk: string) => timeline.push(`write ${chunk.trim()}`),
        end: () => {},
      },
    },
  }
}

/** Just the `step` values, in wire order. */
function stepsIn(timeline: string[]): string[] {
  return timeline
    .filter((e) => e.startsWith('write data: '))
    .map((e) => e.slice('write data: '.length))
    .map((body) => {
      try {
        return (JSON.parse(body) as { step?: string }).step
      } catch {
        return undefined
      }
    })
    .filter((step): step is string => typeof step === 'string')
}

/**
 * A controller whose collaborators record when they were called, so the test
 * can compare the frame order against the call order rather than trusting a
 * hand-written expectation of both.
 */
function harness(opts: { available?: boolean; skillThrows?: boolean } = {}) {
  const timeline: string[] = []
  const ai = {
    isAvailable: () => opts.available !== false,
    buildWorkspaceContext: async () => {
      timeline.push('call buildWorkspaceContext')
      return 'Workspace: Acme'
    },
    chatStream: async (
      _messages: unknown,
      _context: unknown,
      _res: unknown,
      _ctx: unknown,
      _skillPrompt: unknown,
      _tier: unknown,
      opened?: { write: (c: string) => void; end: () => void },
    ) => {
      timeline.push('call chatStream')
      // The real chatStream writes its own step for the model call; mirrored
      // here so the ordering assertions cover the whole sequence.
      opened?.write(`data: ${JSON.stringify({ step: 'writing' })}\n\n`)
      opened?.write('data: [DONE]\n\n')
      opened?.end()
    },
  } as unknown as AiService

  const skills = {
    buildInvocationContext: async () => {
      timeline.push('call buildInvocationContext')
      if (opts.skillThrows) throw new Error('This skill is disabled')
      return {}
    },
    renderSkillPrompt: () => 'You are answering as a skill.',
  }

  // (ai, briefings, skills) — three collaborators, and getting the arity wrong
  // silently lands `skills` in the briefings slot, so `this.skills` is
  // undefined and every skill turn throws into the refusal path. That is
  // exactly how the first run of this file failed.
  const controller = new AiController(ai, {} as never, skills as never)
  const { res } = recordingRes(timeline)
  return { controller, timeline, res }
}

/** Index of the frame announcing `step`, or -1. */
const announced = (timeline: string[], step: string) =>
  timeline.findIndex((e) => e.startsWith('write ') && e.includes(`"step":"${step}"`))

/** Index of the call to `name`, or -1. */
const called = (timeline: string[], name: string) => timeline.indexOf(`call ${name}`)

const USER = { id: 'u1' }
const MESSAGES = [{ role: 'user' as const, content: 'what am I working on?' }]

describe('G13-10 — the assistant says what it is reading', () => {
  it('announces the workspace read BEFORE performing it', async () => {
    const { controller, timeline, res } = harness()
    await controller.chat(USER as never, { messages: MESSAGES, workspaceId: 'ws1' }, res as never)

    assert.deepEqual(stepsIn(timeline), ['workspace', 'writing'])

    /*
     * The claim this file exists to make, and the one a two-array version of
     * this harness silently failed to check.
     *
     * buildWorkspaceContext is the slow part of the turn. If its step were
     * written after the await, the user would stare at nothing through the
     * wait and then see the whole trace appear at once — which is the exact
     * failure the change was made to fix, and it leaves the step ORDER
     * completely unchanged. Only an interleaved timeline can tell them apart.
     */
    assert.ok(announced(timeline, 'workspace') >= 0, 'the workspace step was written')
    assert.ok(called(timeline, 'buildWorkspaceContext') >= 0, 'and the workspace was read')
    assert.ok(
      announced(timeline, 'workspace') < called(timeline, 'buildWorkspaceContext'),
      `announced after the fact — timeline: ${JSON.stringify(timeline)}`,
    )
  })

  it('announces loading a skill before resolving it, too', async () => {
    const { controller, timeline, res } = harness()
    await controller.chat(
      USER as never,
      { messages: MESSAGES, workspaceId: 'ws1', skillId: 'sk1' },
      res as never,
    )
    assert.deepEqual(stepsIn(timeline), ['workspace', 'skill', 'writing'])
    assert.ok(
      announced(timeline, 'skill') < called(timeline, 'buildInvocationContext'),
      `announced after the fact — timeline: ${JSON.stringify(timeline)}`,
    )
  })

  it('says nothing about a workspace when there is no workspace to read', async () => {
    // A step for work that did not happen is worse than no step: it is a claim
    // the reader has no way to check.
    const { controller, timeline, res } = harness()
    await controller.chat(
      USER as never,
      { messages: MESSAGES, workspaceContext: 'pasted context' },
      res as never,
    )

    assert.deepEqual(stepsIn(timeline), ['writing'])
    assert.equal(called(timeline, 'buildWorkspaceContext'), -1, 'no workspace was read')
  })

  it('says nothing about a skill when none was asked for', async () => {
    const { controller, timeline, res } = harness()
    await controller.chat(USER as never, { messages: MESSAGES, workspaceId: 'ws1' }, res as never)
    assert.ok(!stepsIn(timeline).includes('skill'), 'no skill step without a skillId')
    assert.equal(called(timeline, 'buildInvocationContext'), -1, 'and no skill was resolved')
  })

  it('sends a refused skill down the open stream instead of a status code', async () => {
    // The stream is already open by the time a skill can be refused, and
    // res.status().send() throws on flushed headers — the client would get a
    // truncated stream carrying no reason, which is worse than the 4xx it used
    // to receive.
    const { controller, timeline, res } = harness({ skillThrows: true })
    await controller.chat(
      USER as never,
      { messages: MESSAGES, workspaceId: 'ws1', skillId: 'sk1' },
      res as never,
    )

    const joined = timeline.join('\n')
    assert.ok(joined.includes('This skill is disabled'), 'the reason is on the wire')
    assert.ok(joined.includes('[DONE]'), 'and the stream is closed properly')
    assert.ok(!stepsIn(timeline).includes('writing'), 'and no answer was attempted')
  })

  it('still refuses with a status code when AI is not configured at all', async () => {
    // This happens BEFORE the stream is opened, so it must stay a plain 503 —
    // opening a stream just to say "not configured" would leave every caller
    // parsing SSE to discover the feature is off.
    const { controller } = harness({ available: false })
    let status: number | undefined
    let body: unknown
    const res = {
      status: (code: number) => {
        status = code
        return { send: (b: unknown) => { body = b } }
      },
    }
    await controller.chat(USER as never, { messages: MESSAGES }, res as never)
    assert.equal(status, 503)
    assert.deepEqual(body, { error: 'AI features are not configured' })
  })
})
