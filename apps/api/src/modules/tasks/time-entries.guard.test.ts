import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TaskTimeEntriesController } from './time-entries.controller'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'

/**
 * Time is tracked by whoever may read the task: ClickUp's default for view-only
 * members and guests (`guest-guard-reads-the-account-role`). So every route of
 * a task's time — reading entries, starting and stopping a timer, logging time
 * by hand — asks the one read rule, `ResourceMemberGuard`, which lets a guest
 * only where the task is shared with them. Without it, anybody signed in could
 * put time on any task whose id they had.
 *
 * This used to assert that a guest guard was bound to the three writes. That
 * guard read the ACCOUNT's role, which no guest of a workspace holds, so the
 * test passed while it refused nobody. `time-tracking-readers.mjs` measures
 * the rule itself; this keeps the read rule on every route of the controller.
 */
const classGuards = (Reflect.getMetadata('__guards__', TaskTimeEntriesController) ?? []) as unknown[]
const handlerGuards = (method: string): unknown[] =>
  (Reflect.getMetadata('__guards__', (TaskTimeEntriesController.prototype as any)[method]) ?? []) as unknown[]

describe('TaskTimeEntriesController — time asks the read rule', () => {
  it('guards the whole controller with the sign-in and the read rule', () => {
    assert.ok(classGuards.includes(JwtAuthGuard), 'the time routes must ask for a signed-in caller')
    assert.ok(classGuards.includes(ResourceMemberGuard), 'the time routes must ask the task’s read rule')
  })

  for (const method of ['list', 'start', 'stop', 'manual']) {
    it(`${method}() asks nothing beyond it`, () => {
      assert.deepEqual(handlerGuards(method), [], `${method}() carries a guard of its own: time is tracked by whoever may read the task`)
    })
  }
})
