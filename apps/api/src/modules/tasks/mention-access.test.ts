import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canReachTask, type TaskAccessContext } from './mention-access'

/**
 * §V2-05 frame `04:00` — "Does not have access to task".
 *
 * These checks are written from the guard's four steps, in the guard's order:
 * workspace role, container privacy, list privacy, task privacy. A flag that
 * disagrees with the guard is worse than no flag — it either warns about people
 * who are fine (and gets ignored) or stays quiet about people who are not (and
 * the mention becomes an alert leading to a refusal).
 */

const OPEN: TaskAccessContext = {
  spaceVisibility: 'public',
  projectId: 'p1',
  projectVisibility: 'public',
  listVisibility: 'public',
  listCreatedById: 'creator',
  taskVisibility: 'public',
  taskCreatedById: 'creator',
  spaceMemberIds: new Set(),
  spaceAdminIds: new Set(),
  projectMemberIds: new Set(),
  assigneeIds: new Set(),
}
const ctx = (over: Partial<TaskAccessContext>): TaskAccessContext => ({ ...OPEN, ...over })
const member = (userId: string) => ({ userId, workspaceRole: 'member' })

test('an ordinary member reaches an ordinary task', () => {
  assert.equal(canReachTask(OPEN, member('anyone')), true)
})

test('a manager reaches everything, private containers included', () => {
  // The guard's first line. A manager who was greyed out in the picker would be
  // a warning that is wrong about the people most likely to be mentioned.
  const locked = ctx({ spaceVisibility: 'private', taskVisibility: 'private' })
  for (const role of ['workspace_admin', 'manager', 'super_admin']) {
    assert.equal(canReachTask(locked, { userId: 'boss', workspaceRole: role }), true, role)
  }
})

test('a private space is a wall', () => {
  const locked = ctx({ spaceVisibility: 'private', spaceMemberIds: new Set(['inside']) })
  assert.equal(canReachTask(locked, member('inside')), true)
  assert.equal(canReachTask(locked, member('outside')), false)
})

test('a private project admits its members, and the owning space’s admins', () => {
  const locked = ctx({
    projectVisibility: 'private',
    projectMemberIds: new Set(['onproject']),
    spaceAdminIds: new Set(['spaceadmin']),
  })
  assert.equal(canReachTask(locked, member('onproject')), true)
  assert.equal(canReachTask(locked, member('spaceadmin')), true)
  assert.equal(canReachTask(locked, member('neither')), false)
})

test('a private project with no project id is not a wall', () => {
  // A list can sit directly under a space. Treating a null projectId as a
  // locked project would grey out everybody on a task nobody is locked out of.
  const odd = ctx({ projectId: null, projectVisibility: 'private' })
  assert.equal(canReachTask(odd, member('anyone')), true)
})

test('a private list is only for its creator', () => {
  const locked = ctx({ listVisibility: 'private', listCreatedById: 'owner' })
  assert.equal(canReachTask(locked, member('owner')), true)
  assert.equal(canReachTask(locked, member('somebody')), false)
})

test('a private task is for its creator and its assignees', () => {
  const locked = ctx({
    taskVisibility: 'private',
    taskCreatedById: 'author',
    assigneeIds: new Set(['doer']),
  })
  assert.equal(canReachTask(locked, member('author')), true)
  assert.equal(canReachTask(locked, member('doer')), true)
  assert.equal(canReachTask(locked, member('bystander')), false)
})

test('being assigned does not unlock a private container', () => {
  // The steps are ANDed, not ORed. An assignee outside a private space still
  // cannot open the task, so the picker must still warn about them — this is
  // the case where a cheap "is she an assignee?" shortcut would be wrong.
  const locked = ctx({
    spaceVisibility: 'private',
    spaceMemberIds: new Set(),
    assigneeIds: new Set(['doer']),
  })
  assert.equal(canReachTask(locked, member('doer')), false)
})

test('a member with no role recorded is treated as an ordinary member', () => {
  // Never as a manager. Guessing upward here would silence the warning for
  // exactly the people whose standing is unclear.
  const locked = ctx({ taskVisibility: 'private', taskCreatedById: 'author' })
  assert.equal(canReachTask(locked, { userId: 'unknown', workspaceRole: null }), false)
})

test('every restriction has to be lifted, not just the last one', () => {
  // Private space AND private task: being in the space is not enough, and
  // being the task's author is not enough.
  const both = ctx({
    spaceVisibility: 'private',
    spaceMemberIds: new Set(['inside']),
    taskVisibility: 'private',
    taskCreatedById: 'inside',
  })
  assert.equal(canReachTask(both, member('inside')), true)
  const authorOutside = ctx({
    spaceVisibility: 'private',
    spaceMemberIds: new Set(),
    taskVisibility: 'private',
    taskCreatedById: 'author',
  })
  assert.equal(canReachTask(authorOutside, member('author')), false)
})
