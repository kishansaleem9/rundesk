import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ASSIGN_TOOLS,
  describeAssignSuggestion,
  isAssignTool,
  rankAssignees,
  refuseAssign,
  type AssigneeCandidate,
} from './ai-assign'

/**
 * §V2-S17 frame `15:50` — **"⚡ Assign with AI"**: the CHOOSING.
 *
 * `assign_task` has existed the whole time and requires `assigneeEmail`, so the
 * AI could only carry out a decision somebody else had already made. What these
 * tests guard is that the decision is a decision:
 *
 *   · it is made from per-candidate numbers, not from position in the list;
 *   · it survives the list arriving in any order;
 *   · the reason for the pick names the numbers, and differs from the reason
 *     for the runner-up;
 *   · and it does not fall over when everybody is equally busy.
 */

const who = (
  email: string,
  openTasks: number,
  inList = 0,
  overdue = 0,
): AssigneeCandidate => ({ userId: `u-${email}`, email, displayName: email.split('@')[0], openTasks, inList, overdue })

const TASK = '11111111-1111-4111-8111-111111111111'
const pickOf = (cands: AssigneeCandidate[], overloaded?: Set<string>) => {
  const r = rankAssignees(cands, TASK, overloaded)
  assert.ok(r.ok, 'expected a suggestion')
  return r.ok ? r : null
}

describe('§V2-S17 the pick comes from the numbers', () => {
  it('prefers the person already working in this list', () => {
    const r = pickOf([who('ben@x.io', 3, 0), who('ana@x.io', 3, 4)])!
    assert.equal(r.pick.email, 'ana@x.io')
    assert.equal(r.runnerUp?.email, 'ben@x.io')
  })

  it('and, with equal context, the person carrying less', () => {
    const r = pickOf([who('ben@x.io', 9, 2), who('ana@x.io', 2, 2)])!
    assert.equal(r.pick.email, 'ana@x.io')
  })

  /*
   * THE CHECK THE WHOLE ROW TURNS ON. `candidates[0]` satisfies "it picked
   * somebody" every time, and half the time it even picks the right one. So the
   * same set is ranked twice, reversed, and must give the same answer; a
   * position-based implementation gives two different ones and fails here.
   */
  it('does not depend on the order the candidates arrive in', () => {
    const set = [who('ben@x.io', 9, 0), who('ana@x.io', 1, 0), who('cara@x.io', 4, 0)]
    const forwards = pickOf(set)!
    const backwards = pickOf([...set].reverse())!
    assert.equal(forwards.pick.email, 'ana@x.io')
    assert.equal(backwards.pick.email, 'ana@x.io')
    assert.deepEqual(
      forwards.ranked.map((r) => r.email),
      backwards.ranked.map((r) => r.email),
    )
  })

  it('breaks a genuine tie on the email, not on arrival', () => {
    // Two people identical in every measured way is a real state. It has to
    // resolve the same way twice, and it must not resolve to "whoever the
    // query returned first" — that is the defect wearing a sort's clothes.
    const a = who('ana@x.io', 2, 1)
    const b = who('ben@x.io', 2, 1)
    assert.equal(pickOf([b, a])!.pick.email, 'ana@x.io')
    assert.equal(pickOf([a, b])!.pick.email, 'ana@x.io')
  })

  it('pushes an overloaded person out of contention even when they have the context', () => {
    /*
     * Capacity is a gate, not a tie-break: Ben knows this list best and is
     * already flagged by the product's own overload rule, so the work goes to
     * Ana. The flag is passed in rather than recomputed — `findOverloadedAssignees`
     * is the one definition, and the service sources it from there.
     */
    const r = pickOf([who('ben@x.io', 20, 6), who('ana@x.io', 2, 0)], new Set(['u-ben@x.io']))!
    assert.equal(r.pick.email, 'ana@x.io')
    assert.equal(r.ranked[1].overloaded, true)
    assert.match(r.ranked[1].reason, /above the team average/)
  })

  it('opens the gate again when EVERYBODY is overloaded', () => {
    // A uniformly busy team still has a best person for the job. Refusing here
    // would make the feature useless exactly when it is most wanted.
    const r = pickOf([who('ben@x.io', 20, 0), who('ana@x.io', 18, 3)], new Set(['u-ben@x.io', 'u-ana@x.io']))!
    assert.equal(r.pick.email, 'ana@x.io')
    assert.equal(r.pick.overloaded, false)
  })
})

describe('§V2-S17 the pick can be justified', () => {
  it('the reason names this candidate’s own numbers', () => {
    const r = pickOf([who('ana@x.io', 2, 4, 1), who('ben@x.io', 9, 0)])!
    assert.match(r.pick.reason, /4 open tasks in this list/)
    assert.match(r.pick.reason, /2 open tasks overall/)
    assert.match(r.pick.reason, /1 of them late/)
  })

  it('and differs from the runner-up’s, because they are different people', () => {
    /*
     * A reason that reads the same for everybody is a label. This is the same
     * shape as the two unroutable providers each having to name their own
     * provider: "a reason is present" passes on the bug.
     */
    const r = pickOf([who('ana@x.io', 2, 4), who('ben@x.io', 9, 0)])!
    assert.notEqual(r.pick.reason, r.runnerUp?.reason)
    assert.match(r.runnerUp!.reason, /not working in this list yet/)
  })

  it('the sentence names who was preferred over whom', () => {
    const r = rankAssignees([who('ana@x.io', 2, 4), who('ben@x.io', 9, 0)], TASK)
    const said = describeAssignSuggestion(r)
    assert.match(said, /ana/)
    assert.match(said, /Ahead of ben/)
  })

  it('says so plainly when there was nobody to compare against', () => {
    const said = describeAssignSuggestion(rankAssignees([who('ana@x.io', 2)], TASK))
    assert.match(said, /only person/)
    assert.doesNotMatch(said, /Ahead of/)
  })

  it('a refusal says nothing was assigned', () => {
    for (const reason of ['unknown_task', 'no_permission', 'no_candidates', 'already_assigned'] as const) {
      assert.match(describeAssignSuggestion(refuseAssign(reason)), /nothing was assigned/i)
    }
    assert.equal(rankAssignees([], TASK).ok, false)
  })
})

describe('§V2-S17 the tool recommends and does not assign', () => {
  it('takes only a task id — there is no assignee to pass it', () => {
    const tool = ASSIGN_TOOLS.find((t) => t.name === 'suggest_assignee')!
    assert.deepEqual(tool.input_schema.required, ['taskId'])
    assert.deepEqual(Object.keys(tool.input_schema.properties ?? {}), ['taskId'])
  })

  it('tells the model plainly that it does not assign', () => {
    // The one sentence that keeps "who should take this" from becoming
    // "and I gave it to them" in the same turn.
    const tool = ASSIGN_TOOLS.find((t) => t.name === 'suggest_assignee')!
    assert.match(tool.description ?? '', /does NOT assign/)
    assert.match(tool.description ?? '', /assign_task/)
  })

  it('recognises its own tool and nothing else', () => {
    assert.equal(isAssignTool('suggest_assignee'), true)
    assert.equal(isAssignTool('assign_task'), false)
    assert.equal(isAssignTool('create_list'), false)
  })
})
