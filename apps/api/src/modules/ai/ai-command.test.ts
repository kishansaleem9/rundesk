import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  planFromToolCalls,
  searchTasksInContext,
  tasksForBulkFilter,
  type CommandContext,
  type ToolCall,
} from './ai-command'

/**
 * Unit tests for the PURE command planner (Plan §7.6/§7.8).
 *
 * These lock in the core preview→confirm contract without a live model or a DB:
 *  - READ-ONLY search calls are executed against the context (results surface).
 *  - MUTATING calls are turned into a PLAN and never executed (no side effects).
 *  - args are resolved/validated server-side (assigneeEmail→id, list/task in ws).
 * The execute half is exercised separately against Postgres.
 */

const ctx: CommandContext = {
  today: '2026-07-16',
  lists: [
    { id: 'list-back', name: 'Backlog', path: 'Eng / API / Backlog' },
    { id: 'list-sprint', name: 'Sprint', path: 'Eng / API / Sprint' },
  ],
  members: [
    { userId: 'user-a', email: 'alice@theaura.agency', displayName: 'Alice' },
    { userId: 'user-b', email: 'bob@theaura.agency', displayName: 'Bob' },
  ],
  tasks: [
    { id: 't-overdue1', title: 'Fix login timeout', listId: 'list-back', status: 'todo', statusCategory: 'open', dueDate: '2026-07-10', assigneeEmails: ['alice@theaura.agency'] },
    { id: 't-overdue2', title: 'Patch webhook retries', listId: 'list-sprint', status: 'in_progress', statusCategory: 'in_progress', dueDate: '2026-07-01', assigneeEmails: [] },
    { id: 't-future', title: 'Write launch post', listId: 'list-back', status: 'todo', statusCategory: 'open', dueDate: '2026-08-20', assigneeEmails: ['bob@theaura.agency'] },
    { id: 't-doneold', title: 'Old closed thing', listId: 'list-back', status: 'done', statusCategory: 'closed', dueDate: '2026-07-02', assigneeEmails: [] },
    { id: 't-nodate', title: 'Refactor billing', listId: 'list-sprint', status: 'todo', statusCategory: 'open', dueDate: null, assigneeEmails: [] },
  ],
}

describe('planFromToolCalls — read-only executed, mutations planned not executed', () => {
  it('executes search_tasks into readOnlyResults and plans a status change without executing it', () => {
    const calls: ToolCall[] = [
      { name: 'search_tasks', input: { query: 'login' } },
      { name: 'set_task_status', input: { taskId: 't-overdue1', status: 'done' } },
    ]
    const plan = planFromToolCalls(calls, ctx)

    // read-only executed
    assert.equal(plan.readOnlyResults.length, 1)
    assert.deepEqual(plan.readOnlyResults[0].tasks.map((t) => t.id), ['t-overdue1'])

    // mutation planned (present as an action) but NOT executed — it's just a plan
    assert.equal(plan.actions.length, 1)
    const action = plan.actions[0]
    assert.equal(action.tool, 'set_task_status')
    assert.deepEqual(action.affectedTaskIds, ['t-overdue1'])
    assert.match(action.humanLabel, /Set "Fix login timeout" to done/)
    assert.equal(plan.warnings.length, 0)
    assert.match(plan.summary, /Proposed 1 change/)
  })

  it('create_task resolves assigneeEmail→id, validates the list, and stays a plan', () => {
    const plan = planFromToolCalls(
      [
        {
          name: 'create_task',
          input: { title: 'Draft Q3 roadmap', listId: 'list-sprint', priority: 'high', dueDate: '2026-07-30', assigneeEmail: 'bob@theaura.agency' },
        },
      ],
      ctx,
    )
    assert.equal(plan.actions.length, 1)
    const action = plan.actions[0]
    assert.equal(action.tool, 'create_task')
    if (action.tool !== 'create_task') throw new Error('unreachable')
    assert.equal(action.args.listId, 'list-sprint')
    assert.equal(action.args.priority, 'high')
    assert.equal(action.args.dueDate, '2026-07-30')
    assert.equal(action.args.assigneeId, 'user-b')
    assert.equal(action.args.assigneeEmail, 'bob@theaura.agency')
    assert.match(action.humanLabel, /Create task "Draft Q3 roadmap" in Eng \/ API \/ Sprint/)
  })

  it('warns (no action) when a create targets a list outside the workspace', () => {
    const plan = planFromToolCalls([{ name: 'create_task', input: { title: 'Nope', listId: 'list-elsewhere' } }], ctx)
    assert.equal(plan.actions.length, 0)
    assert.equal(plan.warnings.length, 1)
    assert.match(plan.warnings[0], /not in this workspace/)
  })

  it('warns (no action) for an unknown assignee and for an unknown task id', () => {
    const plan = planFromToolCalls(
      [
        { name: 'assign_task', input: { taskId: 't-overdue1', assigneeEmail: 'nobody@theaura.agency' } },
        { name: 'set_task_status', input: { taskId: 't-missing', status: 'done' } },
      ],
      ctx,
    )
    assert.equal(plan.actions.length, 0)
    assert.equal(plan.warnings.length, 2)
    assert.match(plan.warnings[0], /not a workspace member/)
    assert.match(plan.warnings[1], /not in this workspace/)
  })

  it('bulk_reschedule "move all overdue tasks to next week" selects only open overdue tasks', () => {
    const plan = planFromToolCalls(
      [{ name: 'bulk_reschedule', input: { filter: { overdue: true }, toDate: '2026-07-23' } }],
      ctx,
    )
    assert.equal(plan.actions.length, 1)
    const action = plan.actions[0]
    if (action.tool !== 'bulk_reschedule') throw new Error('unreachable')
    // t-overdue1 + t-overdue2 are overdue+open; the closed one and future/no-date are excluded.
    assert.deepEqual(action.args.taskIds.sort(), ['t-overdue1', 't-overdue2'])
    assert.equal(action.args.dueDate, '2026-07-23')
    assert.deepEqual(action.affectedTaskIds.sort(), ['t-overdue1', 't-overdue2'])
    assert.match(action.humanLabel, /Move 2 overdue tasks to 2026-07-23/)
  })

  /*
   * §V2-11 — "No changes made.", the words the audit says are worth stealing.
   *
   * The dangerous case is not silence, it is CONFIDENCE: a model that proposed
   * nothing can still write "I've updated those tasks for you", and before this
   * that sentence became the entire answer. A person reads a success, closes
   * the panel, and discovers later that nothing was done.
   */
  it('says nothing happened even when the model claims otherwise', () => {
    const plan = planFromToolCalls([], ctx, 'I have updated all the overdue tasks for you.')
    assert.match(plan.summary, /^No changes made\./)
    assert.equal(plan.actions.length, 0)
  })

  it('and keeps the explanation, because WHY is the useful half', () => {
    const plan = planFromToolCalls([], ctx, 'I could not find a list by that name.')
    assert.match(plan.summary, /^No changes made\./)
    assert.match(plan.summary, /could not find a list/)
  })

  it('does not stutter when the model already admitted it', () => {
    // "No changes made. I did not make any changes." reads like a stutter, and
    // a product that stutters is trusted less on everything else.
    const plan = planFromToolCalls([], ctx, 'No changes were needed here.')
    assert.equal(plan.summary, 'No changes were needed here.')
    assert.ok(!/No changes made\. No changes/.test(plan.summary))
  })

  it('with no narrative at all, it still says it plainly', () => {
    const plan = planFromToolCalls([], ctx)
    assert.equal(plan.summary, 'No changes made.')
  })

  it('but a narrative still leads when something DID happen', () => {
    // The fix must not reduce every answer to a disclaimer: when actions exist,
    // the model's account of them is the right headline.
    const plan = planFromToolCalls(
      [{ name: 'create_task', input: { listId: 'list-back', title: 'Ship it' } }],
      ctx,
      'Created one task in Inbox.',
    )
    assert.equal(plan.summary, 'Created one task in Inbox.')
    assert.equal(plan.actions.length, 1)
  })

  it('produces no actions and a helpful summary when only searching', () => {
    const plan = planFromToolCalls([{ name: 'search_tasks', input: { status: 'closed' } }], ctx)
    assert.equal(plan.actions.length, 0)
    assert.deepEqual(plan.readOnlyResults[0].tasks.map((t) => t.id), ['t-doneold'])
    assert.match(plan.summary, /No changes were proposed/)
  })
})

describe('searchTasksInContext / tasksForBulkFilter helpers', () => {
  it('filters search by assignee and dueBefore', () => {
    const byAssignee = searchTasksInContext({ assigneeEmail: 'alice@theaura.agency' }, ctx)
    assert.deepEqual(byAssignee.map((t) => t.id), ['t-overdue1'])
    const dueBefore = searchTasksInContext({ dueBefore: '2026-07-15' }, ctx).map((t) => t.id).sort()
    assert.deepEqual(dueBefore, ['t-doneold', 't-overdue1', 't-overdue2'])
  })

  it('an empty bulk filter matches nothing (never selects the whole workspace)', () => {
    assert.deepEqual(tasksForBulkFilter({}, ctx), [])
  })

  it('a status bulk filter selects by status key or category', () => {
    assert.deepEqual(tasksForBulkFilter({ status: 'in_progress' }, ctx).map((t) => t.id), ['t-overdue2'])
  })
})
