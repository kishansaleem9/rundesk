import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mayBeToldAbout, type NotificationReachRules } from './notification-reach'

/*
 * A NOTIFICATION ABOUT AN ITEM GOES ONLY TO SOMEONE WHO MAY READ THE ITEM NOW
 * (`found-6-oct/an-open-socket-outlives-its-access`). Which rule is asked is
 * checked here, with stand-ins for the rules; `realtime-access-ends.mjs` runs
 * the task's and the doc's on a lane, five ways access ends.
 */
function standIns(answer: boolean) {
  const asked: string[] = []
  const rules: NotificationReachRules = {
    task: async (_db, workspaceId, id, who) => { asked.push(`task ${workspaceId} ${id} ${who.id} ${who.role}`); return answer },
    doc: async (_db, workspaceId, id, who) => { asked.push(`doc ${workspaceId} ${id} ${who.id} ${who.role}`); return answer },
    chatMessage: async (_db, workspaceId, id, who) => { asked.push(`chat_message ${workspaceId} ${id} ${who.id} ${who.role}`); return answer },
  }
  return { rules, asked }
}
const DB = {} as never
const WHO = { id: 'u1', role: 'member' }

test('a notification about a task asks the task’s read rule, one about a doc the doc’s, and one about a chat message the channel’s, and goes as they answer', async () => {
  for (const answer of [false, true]) {
    const { rules, asked } = standIns(answer)
    const told = [
      await mayBeToldAbout(DB, WHO, 'w1', { entityType: 'task', entityId: 't1' }, rules),
      await mayBeToldAbout(DB, WHO, 'w1', { entityType: 'doc', entityId: 'd1' }, rules),
      await mayBeToldAbout(DB, WHO, 'w1', { entityType: 'chat_message', entityId: 'm1' }, rules),
    ]
    assert.deepEqual(asked, ['task w1 t1 u1 member', 'doc w1 d1 u1 member', 'chat_message w1 m1 u1 member'], 'an item’s notification did not ask its own read rule')
    assert.deepEqual(told, [answer, answer, answer], 'a notification went against its item’s read rule')
  }
})

test('a notification that names no item to read, or no workspace, asks no rule and goes out', async () => {
  const { rules, asked } = standIns(false)
  const told = [
    await mayBeToldAbout(DB, WHO, 'w1', { entityType: 'timesheet', entityId: 'x' }, rules),
    await mayBeToldAbout(DB, WHO, 'w1', { entityType: 'insights', entityId: 'w1' }, rules),
    await mayBeToldAbout(DB, WHO, 'w1', undefined, rules),
    await mayBeToldAbout(DB, WHO, null, { entityType: 'task', entityId: 't1' }, rules),
  ]
  assert.deepEqual(told, [true, true, true, true], 'a notification naming no item to read was held back')
  assert.deepEqual(asked, [], 'a rule was asked of a notification naming no item to read')
})
