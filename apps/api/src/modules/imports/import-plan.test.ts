import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { emptyBundle, IMPORTED_LIST_NAME, type BundleTask } from '@rundesk/imports'
import { resolveDestination } from './import-destination'
import { importLimitsFor } from './import-limits'
import {
  batches,
  categoryForName,
  chooseStatus,
  defaultStatus,
  DEFAULT_LIST_SOURCE,
  matchAssignee,
  planFolders,
  planLists,
  statusKeyFor,
  supportReference,
  uniqueName,
} from './import-plan'

const task = (over: Partial<BundleTask>): BundleTask => ({
  sourceId: 'r2',
  name: 'T',
  tags: [],
  assignees: [],
  fields: {},
  comments: [],
  attachments: [],
  checklists: [],
  timeEntries: [],
  relationships: [],
  subtaskNames: [],
  ...over,
})

describe('which Lists an import writes into (§2.2)', () => {
  it('a Space, Folder or Project gets a new "Imported from Spreadsheet" List; a List takes the rows itself', () => {
    const b = emptyBundle()
    b.tasks = [task({})]
    assert.deepEqual(planLists(b, false), [{ sourceId: DEFAULT_LIST_SOURCE, name: IMPORTED_LIST_NAME, isDestination: false, alwaysNew: true }])
    assert.deepEqual(planLists(b, true), [{ sourceId: DEFAULT_LIST_SOURCE, name: IMPORTED_LIST_NAME, isDestination: true, alwaysNew: false }])
  })

  it('a List column makes (or uses) one List per value, and no default List when every row names one', () => {
    const b = emptyBundle()
    b.lists = [
      { sourceId: 'list:q4', name: 'Q4' },
      { sourceId: 'list:unused', name: 'Unused' },
    ]
    b.tasks = [task({ listSourceId: 'list:q4' })]
    assert.deepEqual(planLists(b, false), [{ sourceId: 'list:q4', name: 'Q4', isDestination: false, alwaysNew: false }])
  })

  it('a List location: each Folder a project, and two Lists of one name in one project say where they were', () => {
    const b = emptyBundle()
    b.spaces = [
      { sourceId: 'space:a', name: 'Space A' },
      { sourceId: 'space:b', name: 'Space B' },
    ]
    b.folders = [
      { sourceId: 'folder:a > clients', spaceSourceId: 'space:a', name: 'Clients' },
      { sourceId: 'folder:b > clients', spaceSourceId: 'space:b', name: 'Clients' },
      { sourceId: 'folder:b > ops', spaceSourceId: 'space:b', name: 'Ops' },
      { sourceId: 'folder:b > empty', spaceSourceId: 'space:b', name: 'Empty' },
    ]
    b.lists = [
      { sourceId: 'list:a > clients > weekly', spaceSourceId: 'space:a', folderSourceId: 'folder:a > clients', name: 'Weekly' },
      { sourceId: 'list:b > clients > weekly', spaceSourceId: 'space:b', folderSourceId: 'folder:b > clients', name: 'Weekly' },
      { sourceId: 'list:a > inbox', spaceSourceId: 'space:a', name: 'Inbox' },
      { sourceId: 'list:b > inbox', spaceSourceId: 'space:b', name: 'Inbox' },
      { sourceId: 'list:b > ops > board', spaceSourceId: 'space:b', folderSourceId: 'folder:b > ops', name: 'Board' },
      { sourceId: 'list:b > empty > nothing', spaceSourceId: 'space:b', folderSourceId: 'folder:b > empty', name: 'Nothing' },
    ]
    b.tasks = ['list:a > clients > weekly', 'list:b > clients > weekly', 'list:a > inbox', 'list:b > inbox', 'list:b > ops > board'].map((l, i) =>
      task({ sourceId: `r${i + 2}`, listSourceId: l }),
    )
    // A Folder whose Lists hold no rows is no project; two Folders of one name say their Space.
    const folders = planFolders(b)
    assert.deepEqual(folders, [
      { sourceId: 'folder:a > clients', name: 'Clients (Space A)' },
      { sourceId: 'folder:b > clients', name: 'Clients (Space B)' },
      { sourceId: 'folder:b > ops', name: 'Ops' },
    ])
    // Folders made as projects: each Weekly is alone in its project; the two Inboxes share the destination's.
    assert.deepEqual(planLists(b, false, new Set(folders.map((f) => f.sourceId))), [
      { sourceId: 'list:a > clients > weekly', name: 'Weekly', isDestination: false, alwaysNew: false, folderSourceId: 'folder:a > clients' },
      { sourceId: 'list:b > clients > weekly', name: 'Weekly', isDestination: false, alwaysNew: false, folderSourceId: 'folder:b > clients' },
      { sourceId: 'list:a > inbox', name: 'Inbox (Space A)', isDestination: false, alwaysNew: false },
      { sourceId: 'list:b > inbox', name: 'Inbox (Space B)', isDestination: false, alwaysNew: false },
      { sourceId: 'list:b > ops > board', name: 'Board', isDestination: false, alwaysNew: false, folderSourceId: 'folder:b > ops' },
    ])
    // No Folder projects (a Project destination, say): everything shares one project, and the Weeklys say where they were.
    assert.deepEqual(
      planLists(b, false).map((p) => p.name),
      ['Weekly (Space A / Clients)', 'Weekly (Space B / Clients)', 'Inbox (Space A)', 'Inbox (Space B)', 'Board'],
    )
  })

  it('a taken name gets a number', () => {
    assert.equal(uniqueName('Imported from Spreadsheet', ['Other']), 'Imported from Spreadsheet')
    assert.equal(uniqueName('Imported from Spreadsheet', ['imported from spreadsheet', 'Imported from Spreadsheet (2)']), 'Imported from Spreadsheet (3)')
  })
})

describe('statuses', () => {
  const effective = [
    { key: 'todo', name: 'To do', category: 'open', position: 0 },
    { key: 'in_progress', name: 'In progress', category: 'in_progress', position: 1 },
    { key: 'done', name: 'Done', category: 'closed', position: 2 },
  ]

  it('a cell matches a status by name or key, in any case', () => {
    assert.deepEqual(chooseStatus('DONE', effective), { kind: 'existing', key: 'done', category: 'closed' })
    assert.deepEqual(chooseStatus('in progress', effective), { kind: 'existing', key: 'in_progress', category: 'in_progress' })
    assert.deepEqual(chooseStatus('In_Progress', effective), { kind: 'existing', key: 'in_progress', category: 'in_progress' })
  })

  it('a status the list lacks is created, and a closed-sounding one counts as closed', () => {
    assert.deepEqual(chooseStatus('Shipped', effective), { kind: 'create', name: 'Shipped', category: 'open' })
    assert.equal(categoryForName('Completed'), 'closed')
    assert.equal(categoryForName("Won't do"), 'closed')
    assert.equal(categoryForName('In QA'), 'in_progress')
    assert.equal(categoryForName('Backlog'), 'open')
  })

  it('rows with no status get To do, else the first open status', () => {
    assert.deepEqual(defaultStatus(effective), { key: 'todo', category: 'open' })
    assert.deepEqual(defaultStatus(effective.slice(1)), { key: 'in_progress', category: 'in_progress' })
    assert.deepEqual(defaultStatus([]), { key: 'todo', category: 'open' })
  })

  it('a new key is unique among the owner’s', () => {
    assert.equal(statusKeyFor('Shipped!', ['todo']), 'shipped')
    assert.equal(statusKeyFor('Done', ['done', 'done_2']), 'done_3')
  })
})

describe('assignees (§2.3)', () => {
  const members = [
    { userId: 'u1', email: 'Ann@Example.com', displayName: 'Ann Lee' },
    { userId: 'u2', email: 'bo@example.com', displayName: 'Bo' },
    { userId: 'u3', email: 'bo2@example.com', displayName: 'bo' },
  ]
  it('an email matches exactly (any case), a full name case-insensitively', () => {
    assert.deepEqual(matchAssignee('ann@example.com', members), { userId: 'u1' })
    assert.deepEqual(matchAssignee('ANN LEE', members), { userId: 'u1' })
    assert.deepEqual(matchAssignee('Ann', members), { unmatched: 'Ann', ambiguous: false })
    assert.deepEqual(matchAssignee('nobody@example.com', members), { unmatched: 'nobody@example.com' })
  })
  it('a name two members share matches neither', () => {
    assert.deepEqual(matchAssignee('Bo', members), { unmatched: 'Bo', ambiguous: true })
  })
})

describe('limits and odds and ends', () => {
  it('60 imports a day except enterprise, which plan gating never restricts; 100,000 rows everywhere, the file reader’s limit', () => {
    assert.equal(importLimitsFor('free').importsPerDay, 60)
    assert.equal(importLimitsFor('enterprise').importsPerDay, null)
    assert.equal(importLimitsFor('not-a-plan').importsPerDay, null)
    for (const p of ['free', 'pro', 'business', 'enterprise']) assert.equal(importLimitsFor(p).maxRows, 100_000)
  })
  it('batches keep order', () => {
    assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  })
  it('support references are readable', () => {
    let i = 0
    assert.equal(supportReference('IMP', () => (i++ % 31) / 31), 'IMP-ABCDEFGH')
    assert.match(supportReference(), /^IMP-[A-HJKMNP-Z2-9]{8}$/)
  })
})

/* The destination rules: lookups answered by a stand-in, the create gates by recorders. */
const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const ID = '33333333-3333-4333-8333-333333333333'
const ACTOR = { id: '44444444-4444-4444-8444-444444444444', role: null }

function stub(rows: unknown[]) {
  const node = (r: unknown[]) => {
    const p = Promise.resolve(r) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin']) p[v] = () => p
    return p
  }
  const asked: unknown[] = []
  return {
    db: { select: () => node(rows) } as any,
    asked,
    rules: {
      place: (async (_db: unknown, params: unknown) => {
        asked.push(params)
      }) as any,
      createTask: (async () => ({ workspaceId: WS, spaceId: 's', projectId: 'p', folderId: null })) as any,
    },
  }
}

describe('resolveDestination', () => {
  it('asks for a location and refuses a malformed id before any lookup', async () => {
    const s = stub([])
    await assert.rejects(() => resolveDestination(s.db, WS, undefined, ACTOR, s.rules), BadRequestException)
    await assert.rejects(() => resolveDestination(s.db, WS, { type: 'space', id: 'nope' }, ACTOR, s.rules), /Malformed location id/)
  })

  it('a space of another workspace is refused with its reason, and nothing is asked of the create gate', async () => {
    const s = stub([{ id: ID, name: 'S', workspaceId: OTHER_WS, isArchived: false }])
    await assert.rejects(
      () => resolveDestination(s.db, WS, { type: 'space', id: ID }, ACTOR, s.rules),
      (e: unknown) => e instanceof ForbiddenException && e.message === 'That location is not in this workspace',
    )
    assert.deepEqual(s.asked, [])
  })

  it('a missing space is 404; a space in the trash is refused', async () => {
    await assert.rejects(() => resolveDestination(stub([]).db, WS, { type: 'space', id: ID }, ACTOR, stub([]).rules), NotFoundException)
    const s = stub([{ id: ID, name: 'S', workspaceId: WS, isArchived: true }])
    await assert.rejects(() => resolveDestination(s.db, WS, { type: 'space', id: ID }, ACTOR, s.rules), /in the trash/)
  })

  it('a space asks the create gate for a List there, and names itself', async () => {
    const s = stub([{ id: ID, name: 'Marketing', workspaceId: WS.toUpperCase(), isArchived: false }])
    const d = await resolveDestination(s.db, WS, { type: 'space', id: ID }, ACTOR, s.rules)
    assert.deepEqual(s.asked, [{ spaceId: ID, actorId: ACTOR.id, kind: 'list' }])
    assert.equal(d.path, 'Marketing')
    assert.equal(d.listId, null)
  })

  it('a List of another workspace (by its home) is refused', async () => {
    const s = stub([])
    s.rules.createTask = (async () => ({ workspaceId: OTHER_WS, spaceId: 's', projectId: 'p', folderId: null })) as any
    await assert.rejects(() => resolveDestination(s.db, WS, { type: 'list', id: ID }, ACTOR, s.rules), ForbiddenException)
  })
})
