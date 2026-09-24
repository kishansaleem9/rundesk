import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MeetingsService } from './meetings.service'

/**
 * §V2-04 — a task made from a meeting's action items says the meeting made it.
 *
 * `[03:26]` "MILESTONE, FORM RESPONSE, ya MEETING NOTE se task create hue".
 *
 * The form half of this is driven end to end by `test/e2e/task-provenance.mjs`
 * against a real API. The meeting half CANNOT be: turning notes into action
 * items goes through `ai.extractTasksFromNotes`, which needs a model, and
 * neither CI nor a dev machine has a key. That is precisely why it is tested
 * here instead of left uncovered — the gap between "works on a machine with a
 * key" and "works" is where a regression would live unseen.
 *
 * So the model is stubbed and the assertion is on what reaches `createTask`.
 * The type is resolved by its `origin` marker, so the fake db answers a query
 * for it rather than matching a name.
 */

/** Enough of a db for the two reads this path makes. */
function fakeDb(opts: { meetingTypeId: string | null }) {
  const chain = (rows: unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.innerJoin = () => c
    c.leftJoin = () => c
    c.where = () => c
    c.orderBy = () => c
    c.limit = () => Promise.resolve(rows)
    return c
  }
  return {
    // taskTypeIdForOrigin is the only select this test cares about.
    select: () => chain(opts.meetingTypeId ? [{ id: opts.meetingTypeId }] : []),
  }
}

const MEETING = { id: 'm1', title: 'Weekly sync', notes: 'Ali to send the deck by Friday.' }

function harness(opts: { meetingTypeId: string | null; listRefused?: boolean }) {
  const createCalls: Array<Record<string, unknown>> = []
  let modelAsked = 0
  const svc = new MeetingsService(
    fakeDb(opts) as never,
    {
      isAvailable: () => true,
      extractTasksFromNotes: async () => {
        modelAsked += 1
        return [{ title: 'Send the deck', description: '', priority: 'normal' }]
      },
    } as never,
    {
      createTask: async (data: Record<string, unknown>) => {
        createCalls.push(data)
        return { id: 't1', title: data.title }
      },
    } as never,
    {} as never,
  )
  // The two reads before the extraction are membership and the meeting row;
  // neither is what this test is about.
  ;(svc as unknown as { assertMember: () => Promise<void> }).assertMember = async () => {}
  ;(svc as unknown as { load: () => Promise<unknown> }).load = async () => MEETING
  // Whether the caller may make tasks in the list is read-access.ts's rule,
  // driven end to end by `test/e2e/meeting-access.mjs`; here it answers yes,
  // or refuses as it would for a list the caller may not open.
  ;(svc as unknown as { assertCanMakeTasksIn: () => Promise<void> }).assertCanMakeTasksIn = async () => {
    if (opts.listRefused) throw new Error('List not found')
  }
  return { svc, createCalls, modelAsked: () => modelAsked }
}

describe('§V2-04 a meeting stamps the tasks it produces', () => {
  it('passes the meeting type to every task it creates', async () => {
    const { svc, createCalls } = harness({ meetingTypeId: 'type-meeting' })
    await svc.extractActionItems('ws1', 'm1', 'u1', { createIn: 'list1' })

    assert.equal(createCalls.length, 1, 'the action item did not become a task')
    assert.equal(
      createCalls[0].taskTypeId,
      'type-meeting',
      `createTask was called without the meeting type: ${JSON.stringify(createCalls[0])}`,
    )
  })

  /*
   * A workspace may delete the type. Losing a label must not cost the work —
   * the tasks are still created, untyped, exactly as before this existed.
   */
  it('still creates the tasks when the workspace has no such type', async () => {
    const { svc, createCalls } = harness({ meetingTypeId: null })
    await svc.extractActionItems('ws1', 'm1', 'u1', { createIn: 'list1' })

    assert.equal(createCalls.length, 1, 'a missing type stopped the task being made')
    assert.equal(createCalls[0].taskTypeId, null)
  })

  /*
   * The destination is checked before the notes are sent anywhere: a list the
   * caller may not use costs no model call, and makes nothing.
   */
  it('asks the model nothing, and makes nothing, when the list is refused', async () => {
    const { svc, createCalls, modelAsked } = harness({ meetingTypeId: 'type-meeting', listRefused: true })
    await assert.rejects(() => svc.extractActionItems('ws1', 'm1', 'u1', { createIn: 'list1' }), /List not found/)
    assert.equal(modelAsked(), 0, 'the model was asked before the destination was checked')
    assert.equal(createCalls.length, 0)
  })
})
