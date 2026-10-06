import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { assertImportTarget } from './import-target'

/*
 * WHERE AN IMPORT MAY PUT WHAT IT IMPORTS (`found-5-oct/import-writes-into-another-workspace`):
 * a space of the route's workspace, which the create gate lets the importer add a project to.
 * The space lookup is answered by a stand-in; the create gate is a recorder, so these say
 * what is asked of it and when it is not asked at all.
 */
const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const SPACE = '33333333-3333-4333-8333-333333333333'
const ACTOR = '44444444-4444-4444-8444-444444444444'

function setUp(rows: unknown[]) {
  let selects = 0
  const node = (r: unknown[]) => {
    const p = Promise.resolve(r) as any
    for (const v of ['from', 'where', 'limit']) p[v] = () => p
    return p
  }
  const db = { select: () => { selects++; return node(rows) } } as any
  const asked: unknown[] = []
  const place = (async (_db: unknown, params: unknown) => { asked.push(params) }) as any
  return { db, place, asked, selects: () => selects }
}

describe('assertImportTarget', () => {
  it('a malformed id is 400, and nothing is looked up', async () => {
    const s = setUp([])
    await assert.rejects(
      () => assertImportTarget(s.db, { workspaceId: WS, spaceId: 'not-a-space', actorId: ACTOR }, s.place),
      (e: unknown) => e instanceof BadRequestException && /Malformed space id/.test(e.message),
    )
    await assert.rejects(() => assertImportTarget(s.db, { workspaceId: WS, spaceId: 42, actorId: ACTOR }, s.place), BadRequestException)
    assert.equal(s.selects(), 0)
    assert.deepEqual(s.asked, [])
  })

  it('an id naming nothing is 404 “Space not found”', async () => {
    const s = setUp([])
    await assert.rejects(
      () => assertImportTarget(s.db, { workspaceId: WS, spaceId: SPACE, actorId: ACTOR }, s.place),
      (e: unknown) => e instanceof NotFoundException && e.message === 'Space not found',
    )
    assert.deepEqual(s.asked, [])
  })

  it('a space of another workspace is 403 with its reason, and the create gate is not asked', async () => {
    const s = setUp([{ id: SPACE, workspaceId: OTHER_WS }])
    await assert.rejects(
      () => assertImportTarget(s.db, { workspaceId: WS, spaceId: SPACE, actorId: ACTOR }, s.place),
      (e: unknown) => e instanceof ForbiddenException && e.message === 'That space is not in this workspace',
    )
    assert.deepEqual(s.asked, [])
  })

  it('a workspace named in capitals is the same workspace: its own space is not refused as another’s', async () => {
    // An id with letters in it, as Postgres writes them: lower case.
    const lettered = 'abcdef12-1111-4111-8111-1111111111aa'
    const s = setUp([{ id: SPACE, workspaceId: lettered }])
    await assertImportTarget(s.db, { workspaceId: lettered.toUpperCase(), spaceId: SPACE, actorId: ACTOR }, s.place)
    assert.deepEqual(s.asked, [{ spaceId: SPACE, actorId: ACTOR, kind: 'project' }])
  })

  it('a space of this workspace is put to the create gate, for the project the import makes there', async () => {
    const s = setUp([{ id: SPACE, workspaceId: WS }])
    await assertImportTarget(s.db, { workspaceId: WS, spaceId: SPACE, actorId: ACTOR }, s.place)
    assert.deepEqual(s.asked, [{ spaceId: SPACE, actorId: ACTOR, kind: 'project' }])
  })

  it('and what the create gate refuses is the answer', async () => {
    const s = setUp([{ id: SPACE, workspaceId: WS }])
    const refuse = (async () => {
      throw new ForbiddenException(`This space's default permission is "View only", which does not allow adding a project`)
    }) as any
    await assert.rejects(
      () => assertImportTarget(s.db, { workspaceId: WS, spaceId: SPACE, actorId: ACTOR }, refuse),
      (e: unknown) => e instanceof ForbiddenException && /View only/.test(e.message),
    )
  })
})
