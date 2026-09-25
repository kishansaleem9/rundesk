import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ChecklistTemplatesService } from './checklist-templates.service'

/**
 * Each top-level `select()` resolves to the next queued result set, matching the
 * order the service queries in. Inserted payloads are captured so we can assert
 * what actually gets written.
 */
function makeDb(selectResults: any[][]) {
  let i = 0
  const chain = (rows: any[]): any => {
    const c: any = {
      from: () => c, where: () => c, limit: () => c, innerJoin: () => c, orderBy: () => c,
      then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
    }
    return c
  }
  const inserted: any[] = []
  const deleted: any[] = []
  const db: any = {
    select: mock.fn(() => chain(selectResults[i++] ?? [])),
    insert: mock.fn(() => ({
      values: (v: any) => {
        inserted.push(v)
        return { returning: async () => [Array.isArray(v) ? v[0] : { id: 'new-id', ...v }] }
      },
    })),
    delete: mock.fn(() => ({ where: async () => { deleted.push(true) } })),
  }
  return { db, inserted, deleted }
}

const member = [{ userId: 'u1' }]
/** The task write rule's answer, for `applyToTask`: allowed unless a test says otherwise. */
const allowEdits = { assertMayEditTask: async () => {} }
const svcWith = (results: any[][], tasks: { assertMayEditTask: (...a: any[]) => Promise<void> } = allowEdits) => {
  const { db, inserted, deleted } = makeDb(results)
  return { svc: new ChecklistTemplatesService(db, tasks as never), inserted, deleted }
}
/** What `readableTask` reads for a member on a task in an open space: the task, their role, its folder (none). */
const readable = [
  [{ taskId: 'task1', listId: 'l1', taskVisibility: 'public', taskCreatedById: 'x', listVisibility: 'public', listCreatedById: 'x', projectId: 'p1', projectVisibility: 'public', spaceId: 's1', spaceVisibility: 'public' }],
  [{ role: 'member' }],
  [],
]

describe('ChecklistTemplatesService.create', () => {
  it('stores the trimmed items and drops blank ones', async () => {
    const { svc, inserted } = svcWith([member])
    const res = await svc.create('w1', 'u1', { name: 'QA pass', items: ['  a  ', '', '   ', 'b'] })
    assert.equal(res.itemCount, 2)
    const itemRows = inserted.find((v) => Array.isArray(v))
    assert.ok(itemRows, 'expected an item insert')
    assert.deepEqual(itemRows.map((r: any) => r.content), ['a', 'b'])
    // Position is assigned from the surviving order, not the original index.
    assert.deepEqual(itemRows.map((r: any) => r.position), [0, 1])
  })

  it('refuses a blank name', async () => {
    const { svc } = svcWith([member])
    await assert.rejects(() => svc.create('w1', 'u1', { name: '   ' }), /template name is required/i)
  })

  it('refuses a name that is too long', async () => {
    const { svc } = svcWith([member])
    await assert.rejects(() => svc.create('w1', 'u1', { name: 'x'.repeat(201) }), /200 characters/)
  })

  it('refuses more items than the cap', async () => {
    const { svc } = svcWith([member])
    const items = Array.from({ length: 201 }, (_, n) => `item ${n}`)
    await assert.rejects(() => svc.create('w1', 'u1', { name: 'big', items }), /at most 200 items/)
  })

  it('refuses a non-member', async () => {
    const { svc } = svcWith([[]])
    await assert.rejects(() => svc.create('w1', 'u1', { name: 'nope' }), /Workspace membership required/)
  })
})

describe('ChecklistTemplatesService.applyToTask', () => {
  // workspaceOfTask -> assertMember -> template -> template items -> existing checklists
  const ok = (tplWorkspace = 'w1') => [
    [{ workspaceId: 'w1' }],
    member,
    [{ id: 't1', workspaceId: tplWorkspace, name: 'QA pass' }],
    [{ id: 'i1', content: 'Smoke test', position: 0 }, { id: 'i2', content: 'Sign off', position: 1 }],
    [{ position: 0 }, { position: 1 }],
  ]

  it('copies the items onto the task, unchecked', async () => {
    const { svc, inserted } = svcWith(ok())
    const res = await svc.applyToTask('task1', 't1', 'u1')
    assert.equal(res.itemCount, 2)
    const itemRows = inserted.find((v) => Array.isArray(v))
    assert.ok(itemRows, 'expected an item insert')
    assert.deepEqual(itemRows.map((r: any) => r.content), ['Smoke test', 'Sign off'])
    // Nothing carries done-ness or an assignee over from the template.
    assert.ok(itemRows.every((r: any) => r.isDone === undefined && r.assigneeId === undefined))
  })

  it('appends after the checklists already on the task', async () => {
    const { svc, inserted } = svcWith(ok())
    await svc.applyToTask('task1', 't1', 'u1')
    const checklistRow = inserted.find((v) => !Array.isArray(v) && 'taskId' in v)
    assert.equal(checklistRow.position, 2)
  })

  it('refuses a template belonging to another workspace', async () => {
    const { svc } = svcWith(ok('other-workspace'))
    await assert.rejects(() => svc.applyToTask('task1', 't1', 'u1'), /template not found/i)
  })

  it('404s when the template is gone', async () => {
    const { svc } = svcWith([[{ workspaceId: 'w1' }], member, []])
    await assert.rejects(() => svc.applyToTask('task1', 'missing', 'u1'), /template not found/i)
  })

  it('404s when the task is gone', async () => {
    const { svc } = svcWith([[]])
    await assert.rejects(() => svc.applyToTask('missing', 't1', 'u1'), /Task not found/)
  })

  it('asks the task write rule, and adds nothing where it refuses', async () => {
    const refuse = { assertMayEditTask: async () => { throw new Error('This space\'s default permission is "View only"') } }
    const { svc, inserted } = svcWith([[{ workspaceId: 'w1' }], member], refuse)
    await assert.rejects(() => svc.applyToTask('task1', 't1', 'u1'), /View only/)
    assert.equal(inserted.length, 0)
  })
})

describe('ChecklistTemplatesService.createFromChecklist', () => {
  it('names the template after the checklist when none is given', async () => {
    // checklist -> workspaceOfTask -> assertMember -> readableTask -> items -> assertMember(create)
    const { svc, inserted } = svcWith([
      [{ id: 'c1', taskId: 'task1', title: 'Launch steps' }],
      [{ workspaceId: 'w1' }],
      member,
      ...readable,
      [{ content: 'one' }, { content: 'two' }],
      member,
    ])
    const res = await svc.createFromChecklist('c1', { id: 'u1' })
    assert.equal(res.name, 'Launch steps')
    assert.equal(res.itemCount, 2)
    assert.ok(inserted.some((v) => !Array.isArray(v) && v.name === 'Launch steps'))
  })

  it('404s for a checklist that does not exist', async () => {
    const { svc } = svcWith([[]])
    await assert.rejects(() => svc.createFromChecklist('nope', { id: 'u1' }), /Checklist not found/)
  })

  it('404s for a checklist on a task the caller may not read, and makes no template', async () => {
    const { svc, inserted } = svcWith([
      [{ id: 'c1', taskId: 'task1', title: 'Launch steps' }],
      [{ workspaceId: 'w1' }],
      member,
      [],
    ])
    await assert.rejects(() => svc.createFromChecklist('c1', { id: 'u1' }), /Checklist not found/)
    assert.equal(inserted.length, 0)
  })
})

describe('ChecklistTemplatesService.remove', () => {
  it('deletes a template in a workspace the caller belongs to', async () => {
    const { svc, deleted } = svcWith([[{ id: 't1', workspaceId: 'w1' }], member])
    assert.deepEqual(await svc.remove('t1', 'u1'), { ok: true })
    assert.equal(deleted.length, 1)
  })

  it('refuses a non-member', async () => {
    const { svc, deleted } = svcWith([[{ id: 't1', workspaceId: 'w1' }], []])
    await assert.rejects(() => svc.remove('t1', 'u1'), /Workspace membership required/)
    assert.equal(deleted.length, 0)
  })
})
