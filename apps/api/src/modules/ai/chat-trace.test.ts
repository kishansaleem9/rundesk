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
    /*
     * §V2-11 — "not configured" is a FAILED RUN and is written down as one
     * (migration 0150), so the route records before it refuses. On the timeline
     * because the ORDER matters: the row has to be written before the 503
     * leaves, or the Activity log's Status filter comes up empty exactly when
     * somebody is trying to find out why nothing works.
     */
    recordFailure: async (feature: string) => {
      timeline.push(`record failure ${feature}`)
    },
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

  /*
   * The skill step is the ONE exception to "announce, then do", and it is a
   * deliberate trade rather than an oversight.
   *
   * A skill can be refused — it may be invisible to this caller, or its author
   * may have switched it off — and a refusal is an authorization answer, which
   * belongs in a status code. That is only possible while the headers are
   * unsent, so the skill is resolved BEFORE the stream opens and its step
   * reports work already done.
   *
   * The alternative was tried and is what this test used to assert: resolve
   * inside the open stream, announce first, and send the refusal down the wire
   * as an error frame. It failed closed correctly, but every caller saw HTTP
   * 201 and had to read the body to find out it had been refused — which a
   * deployed-app check duly reported as "a disabled skill was accepted".
   *
   * The cost is bounded: resolving a skill is three indexed reads, against
   * `buildWorkspaceContext` — the genuinely slow step — which still announces
   * itself before it runs. So the step order on the wire is unchanged, and
   * only this one line's relationship to its own work has moved.
   */
  it('resolves a skill before opening the stream, so a refusal can be a status', async () => {
    const { controller, timeline, res } = harness()
    await controller.chat(
      USER as never,
      { messages: MESSAGES, workspaceId: 'ws1', skillId: 'sk1' },
      res as never,
    )
    assert.deepEqual(
      stepsIn(timeline),
      ['workspace', 'skill', 'writing'],
      'the reader sees the same steps in the same order as before',
    )
    assert.ok(
      called(timeline, 'buildInvocationContext') < announced(timeline, 'workspace'),
      `the skill was resolved after the stream had already started — timeline: ${JSON.stringify(timeline)}`,
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

  it('refuses a skill with a status code, having written nothing', async () => {
    /*
     * The refusal is left to propagate as the exception the skills service
     * already throws, so Nest maps it to the 400 or 404 it deserves. Nothing
     * may have been written by then: a single frame on the wire means the
     * headers are flushed and the status is spent, which is the state this
     * whole ordering exists to avoid.
     */
    const { controller, timeline, res } = harness({ skillThrows: true })

    await assert.rejects(
      () =>
        controller.chat(
          USER as never,
          { messages: MESSAGES, workspaceId: 'ws1', skillId: 'sk1' },
          res as never,
        ),
      /disabled/,
      'the refusal was swallowed, so the caller cannot have been given a status',
    )
    assert.deepEqual(
      timeline.filter((e) => e.startsWith('write ')),
      [],
      `the stream was already open when the skill was refused — timeline: ${JSON.stringify(timeline)}`,
    )
    assert.ok(!stepsIn(timeline).includes('writing'), 'and no answer was attempted')
  })

  it('still refuses with a status code when AI is not configured at all', async () => {
    // This happens BEFORE the stream is opened, so it must stay a plain 503 —
    // opening a stream just to say "not configured" would leave every caller
    // parsing SSE to discover the feature is off.
    const { controller, timeline } = harness({ available: false })
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
    /*
     * §V2-11 — and it is RECORDED, before the refusal goes out. Until 0150 the
     * commonest AI failure this product has left no trace at all, which is why
     * the Activity log's Status filter could not exist.
     */
    assert.deepEqual(
      timeline,
      ['record failure chat'],
      `a refused-because-unconfigured run was not written down — timeline: ${JSON.stringify(timeline)}`,
    )
  })
})
