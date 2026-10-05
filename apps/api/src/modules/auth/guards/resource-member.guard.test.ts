import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequestException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common'
import type { Db } from '@rundesk/db'
import { ResourceMemberGuard } from './resource-member.guard'

// Mock: the guard resolves a workspace (1 select chain) then checks membership
// (a 2nd select chain). `resolveRows` feeds the first, `memberRows` the second.
function makeDb(resolveRows: unknown[], memberRows: unknown[]): Db {
  let call = 0
  const chain = (rows: unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.innerJoin = () => c
    c.where = () => c
    c.limit = () => Promise.resolve(rows)
    return c
  }
  return { select: () => chain(call++ === 0 ? resolveRows : memberRows) } as unknown as Db
}
function ctxFor(user: unknown, params: unknown, body: unknown = {}): ExecutionContext {
  const req = { user, params, body }
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}
/*
 * Ids shaped like the real thing.
 *
 * The mock db ignores them, so these used to be readable stand-ins — 'ws-1',
 * 'sp-1'. But every id the guard resolves addresses a `uuid` column, and it now
 * turns away anything that cannot be one BEFORE querying, because a non-uuid is
 * not a lookup that misses: Postgres refuses the query outright. A stand-in id
 * therefore exercised a path production can never reach.
 */
const WS = '11111111-1111-4111-8111-111111111111'
const SPACE = '22222222-2222-4222-8222-222222222222'
const LIST = '33333333-3333-4333-8333-333333333333'
const TASK = '44444444-4444-4444-8444-444444444444'
const ABSENT = '55555555-5555-4555-8555-555555555555'

test('rejects unauthenticated', async () => {
  const g = new ResourceMemberGuard(makeDb([], []))
  await assert.rejects(() => g.canActivate(ctxFor(undefined, { workspaceId: WS })), ForbiddenException)
})

test('DENIES a non-member for a workspace param', async () => {
  const g = new ResourceMemberGuard(makeDb([], [])) // workspaceId direct → membership empty
  await assert.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), ForbiddenException)
})

test('DENIES a non-member resolving via spaceId', async () => {
  const g = new ResourceMemberGuard(makeDb([{ w: WS }], [])) // space resolves to WS, but no membership
  await assert.rejects(() => g.canActivate(ctxFor({ id: 'outsider', role: 'member' }, { spaceId: SPACE })), ForbiddenException)
})

/*
 * A MEMBER REFUSED BY THE RULES BELOW THE MEMBERSHIP IS TOLD WHICH ONE: 403, in
 * the words of the wall in front of the thing — a private task, a private list,
 * a private space — while an id that names nothing is the 404 above
 * (`found-30-sep/private-task-reads-say-403`). A db that answers its selects in
 * order: the resolve row, the membership row, then whatever the container rule
 * reads (a private space's members: none).
 */
function makeSeqDb(queue: unknown[][]): Db {
  let call = 0
  const chain = (rows: unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const k of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy']) c[k] = () => c
    c.limit = () => Promise.resolve(rows)
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows).then(res, rej)
    return c
  }
  return { select: () => chain(queue[call++] ?? []), execute: async () => [] } as unknown as Db
}
const MEMBER = { id: 'plain-member', role: 'member' }
const taskRow = (over: Record<string, unknown> = {}) => ({
  w: WS, spaceId: SPACE, sv: 'public', projectId: null, pv: null,
  lv: 'public', lc: 'someone-else', tv: 'public', tc: 'someone-else', isAssignee: false, ...over,
})
const forbiddenSaying = (words: string) => (err: unknown) =>
  err instanceof ForbiddenException && err.getStatus() === 403 && err.message === words

test('a member refused a private task is answered 403 “This task is private”', async () => {
  const g = new ResourceMemberGuard(makeSeqDb([[taskRow({ tv: 'private' })], [{ role: 'member' }]]))
  await assert.rejects(() => g.canActivate(ctxFor(MEMBER, { taskId: TASK })), forbiddenSaying('This task is private'))
})

test('a member refused a private list is answered 403 “This list is private”', async () => {
  const g = new ResourceMemberGuard(makeSeqDb([[{ w: WS, spaceId: SPACE, sv: 'public', projectId: null, pv: null, lv: 'private', lc: 'someone-else' }], [{ role: 'member' }]]))
  await assert.rejects(() => g.canActivate(ctxFor(MEMBER, { listId: LIST })), forbiddenSaying('This list is private'))
})

test('a member refused a private space is answered 403 “This space or project is private”', async () => {
  // The resolve row, the membership, then the space's members: not this one.
  const g = new ResourceMemberGuard(makeSeqDb([[{ w: WS, spaceId: SPACE, sv: 'private' }], [{ role: 'member' }], []]))
  await assert.rejects(() => g.canActivate(ctxFor(MEMBER, { spaceId: SPACE })), forbiddenSaying('This space or project is private'))
})

test('the same member opens the task once it is theirs to open, so the refusals above are about the task', async () => {
  const g = new ResourceMemberGuard(makeSeqDb([[taskRow({ tv: 'private', tc: MEMBER.id })], [{ role: 'member' }]]))
  assert.equal(await g.canActivate(ctxFor(MEMBER, { taskId: TASK })), true)
})

/*
 * The distinction the 404 above does NOT make.
 *
 * A well-formed id that resolves to nothing is a miss, and 404 says so. An id
 * that cannot be a uuid never gets that far: Postgres refuses the query, which
 * used to surface as a database error and left `invalid input syntax for type
 * uuid` all over the CI log. `makeDb` throwing here is the point — reaching it
 * at all is the failure.
 */
test('REFUSES an id that cannot be one, without querying', async () => {
  const exploded = {
    select: () => {
      throw new Error('the guard queried on a malformed id')
    },
  } as unknown as Db
  const g = new ResourceMemberGuard(exploded)
  await assert.rejects(
    () => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { spaceId: 'dashboards' })),
    BadRequestException,
  )
})

test('404 when the resource does not resolve to a workspace', async () => {
  const g = new ResourceMemberGuard(makeDb([], [])) // taskId resolves to nothing
  await assert.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { taskId: ABSENT })), NotFoundException)
})

test('ALLOWS a member resolving via listId (body)', async () => {
  const g = new ResourceMemberGuard(makeDb([{ w: WS }], [{ role: 'member' }]))
  assert.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' }, {}, { listId: LIST })), true)
})

test('ALLOWS super_admin without a membership row', async () => {
  const g = new ResourceMemberGuard(makeDb([{ w: WS }], []))
  assert.equal(await g.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, { taskId: TASK })), true)
})

test('populates req.workspaceMember for super_admin (so PermissionsGuard has workspace context)', async () => {
  const g = new ResourceMemberGuard(makeDb([{ w: WS }], []))
  const req = { user: { id: 'root', role: 'super_admin' }, params: {}, body: { spaceId: SPACE } } as Record<string, unknown>
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
  assert.equal(await g.canActivate(ctx), true)
  assert.deepEqual(req.workspaceMember, { workspaceId: WS, userId: 'root', role: 'super_admin' })
})
