import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { assertMayDefineFields, listOfProject } from './field-access'

/*
 * `found-30-sep/field-definition-takes-a-foreign-list` — the list a field is
 * scoped to was put first in the rule's `within` as it was sent, and the most
 * specific grant decides: a member refused fields in a view-only space defined
 * one there by naming a list of ANOTHER space shared with them to edit (201).
 */

const WS = '00000000-0000-4000-8000-0000000000aa'
const PROJECT = '00000000-0000-4000-8000-0000000000b1'
const OWN_LIST = '00000000-0000-4000-8000-0000000000c1'
const FOREIGN_LIST = '00000000-0000-4000-8000-0000000000c2'
const MEMBER = { id: '00000000-0000-4000-8000-0000000000d1', role: 'user' }
const SOMEBODY_ELSE = '00000000-0000-4000-8000-0000000000d2'

const dialect = new PgDialect()

/**
 * A database whose selects answer by the table they read, each table from its
 * own queue in the order it is asked — so a rule that asks one query more or
 * fewer still reads every other table's answer. It keeps each query's `where`,
 * so a test can ask what was asked of a table, not only what it answered.
 */
function dbByTable(answers: Record<string, unknown[][]>) {
  const queues = Object.fromEntries(Object.entries(answers).map(([table, rows]) => [table, [...rows]]))
  const asked: string[] = []
  const wheres: Array<{ table: string; condition: unknown }> = []
  const db = {
    select: () => {
      let rows: unknown[] = []
      let table = ''
      const q: any = {
        from: (t: unknown) => {
          table = getTableName(t as never)
          asked.push(table)
          rows = queues[table]?.shift() ?? []
          return q
        },
        where: (condition: unknown) => {
          wheres.push({ table, condition })
          return q
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
      }
      for (const step of ['innerJoin', 'leftJoin', 'orderBy', 'limit']) q[step] = () => q
      return q
    },
  } as any
  /** The SQL and parameters of each query asked of `table`, in order. */
  const askedOf = (table: string) => wheres.filter((w) => w.table === table).map((w) => dialect.sqlToQuery(w.condition as never))
  return { db, asked, askedOf }
}

/** The read rule's row for a list of PROJECT (`readableList`): open, or private and somebody else's. */
const listRow = (visibility: 'public' | 'private') => ({
  listId: OWN_LIST,
  listVisibility: visibility,
  listCreatedById: SOMEBODY_ELSE,
  projectId: PROJECT,
  projectVisibility: 'public',
  spaceId: 'space-view',
  spaceVisibility: 'public',
})

/**
 * A member of the workspace, in a space whose default is "View only", holding
 * an edit share on `sharedList` — and on nothing else. When the list is the
 * project's, the read rule asks it again (`readableList`): the list, the
 * member's role, and the project's folder (none).
 */
const viewOnlySpaceWithAShareOn = (sharedList: string, listIsTheProjects: boolean, visibility: 'public' | 'private' = 'public') =>
  dbByTable({
    projects: [[{ role: 'member', spaceId: 'space-view', folderId: null }], []],
    lists: listIsTheProjects ? [[{ id: sharedList }], [listRow(visibility)]] : [[]],
    spaces: [[{ workspaceId: WS, defaultPermission: 'view' }]],
    workspace_members: listIsTheProjects ? [[{ role: 'member' }], [{ role: 'member' }]] : [[{ role: 'member' }]],
    // The shares on the steps of `within`, then the share on the space itself.
    object_shares: [[{ objectType: 'list', objectId: sharedList, level: 'edit' }], []],
    project_members: [[]],
    space_members: [[]],
  })

describe('assertMayDefineFields — a list of another project is no step on the way (found-30-sep/field-definition-takes-a-foreign-list)', () => {
  it('a share on a list of another project does not let a member define a field in a view-only space: the space’s answer stands (403)', async () => {
    const { db } = viewOnlySpaceWithAShareOn(FOREIGN_LIST, false)
    await assert.rejects(
      assertMayDefineFields(db, { workspaceId: WS, projectId: PROJECT, reader: MEMBER, listId: FOREIGN_LIST }),
      (e) => e instanceof ForbiddenException && /"View only"/.test((e as Error).message),
    )
  })

  it('while a share on a list of this project lets them define a field scoped to it', async () => {
    const { db } = viewOnlySpaceWithAShareOn(OWN_LIST, true)
    await assertMayDefineFields(db, { workspaceId: WS, projectId: PROJECT, reader: MEMBER, listId: OWN_LIST })
  })

  it('asks whether the list is one of this project’s with the list and the project, each in its own column', async () => {
    const { db, askedOf } = viewOnlySpaceWithAShareOn(OWN_LIST, true)
    await assertMayDefineFields(db, { workspaceId: WS, projectId: PROJECT, reader: MEMBER, listId: OWN_LIST })
    const [first] = askedOf('lists')
    assert.ok(first, 'the rule asked nothing of the lists')
    assert.match(first.sql, /"lists"\."id" = \$1 and "lists"\."project_id" = \$2/)
    assert.deepEqual(first.params, [OWN_LIST, PROJECT])
  })

  it('refuses a field scoped to a private list of this project to a member who may not open it, in its own words (403 “This list is private”)', async () => {
    const { db } = viewOnlySpaceWithAShareOn(OWN_LIST, true, 'private')
    await assert.rejects(
      assertMayDefineFields(db, { workspaceId: WS, projectId: PROJECT, reader: MEMBER, listId: OWN_LIST }),
      (e) => e instanceof ForbiddenException && (e as Error).message === 'This list is private',
    )
  })
})

describe('listOfProject — a list of this project, or none', () => {
  it('asks the database for the list within the project, and answers what it finds', async () => {
    assert.equal(await listOfProject(dbByTable({ lists: [[{ id: OWN_LIST }]] }).db, PROJECT, OWN_LIST), true)
    assert.equal(await listOfProject(dbByTable({ lists: [[]] }).db, PROJECT, FOREIGN_LIST), false)
  })

  it('answers no for an id that is not shaped like one, without asking', async () => {
    const { db, asked } = dbByTable({ lists: [[{ id: 'whatever' }]] })
    assert.equal(await listOfProject(db, PROJECT, 'not-a-list'), false)
    assert.deepEqual(asked, [])
  })

  it('answers no for a list’s id sent in an array, without asking — its text reads as the id', async () => {
    const { db, asked } = dbByTable({ lists: [[{ id: OWN_LIST }]] })
    assert.equal(await listOfProject(db, PROJECT, [OWN_LIST]), false)
    assert.deepEqual(asked, [])
  })
})
