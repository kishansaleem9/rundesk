import { BadRequestException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { TaskTemplatesService, fitTemplateValue } from './task-templates.service'

/**
 * The service has two clearly testable surfaces:
 *   1. Payload normalisation (pure, no DB) — clamps arrays, drops
 *      unknown priorities, forbids negative time estimates, strips
 *      bogus values from customFieldValues.
 *   2. Name / description validation in create() — surfaced via
 *      thrown BadRequestException.
 *
 * Deeper plumbing (saveFromTask + instantiate) goes through
 * TasksService.createTask which we treat as an integration boundary;
 * unit-testing it here would require mocking the whole service.
 */

function buildDb(opts: { selectQueues?: any[][]; insertReturning?: any[] } = {}) {
  const selectQueue = [...(opts.selectQueues ?? [])]
  const chainable = (rows: any[]) => ({
    then: (resolve: (v: any) => void, reject?: (e: any) => void) =>
      Promise.resolve(rows).then(resolve, reject),
    limit: mock.fn(async () => rows),
    orderBy: mock.fn(() => chainable(rows)),
  })
  return {
    select: mock.fn(() => ({
      from: mock.fn(() => ({
        where: mock.fn(() => chainable(selectQueue.shift() ?? [])),
        orderBy: mock.fn(() => chainable(selectQueue.shift() ?? [])),
        limit: mock.fn(async () => selectQueue.shift() ?? []),
      })),
    })),
    insert: mock.fn(() => ({
      values: mock.fn(() => ({
        returning: mock.fn(async () => opts.insertReturning ?? [{ id: 'tpl-1' }]),
      })),
    })),
    update: mock.fn(() => ({
      set: mock.fn(() => ({
        where: mock.fn(() => ({
          returning: mock.fn(async () => [{ id: 'tpl-1', name: 'Patched' }]),
        })),
      })),
    })),
    delete: mock.fn(() => ({ where: mock.fn(async () => undefined) })),
  } as any
}

const tasksServiceStub: any = { createTask: mock.fn(async () => ({ id: 'task-1' })) }
const securityStub: any = { logAuditEvent: mock.fn(async () => undefined) }
const ACTOR = { id: '00000000-0000-0000-0000-000000000001', email: 'a@b.com' }
const WORKSPACE_ID = '00000000-0000-0000-0000-0000000000aa'

describe('TaskTemplatesService.create — input validation', () => {
  it('rejects empty names', async () => {
    const svc = new TaskTemplatesService(buildDb(), tasksServiceStub, securityStub)
    await assert.rejects(
      () => svc.create(WORKSPACE_ID, ACTOR, { name: '   ' }),
      (e) => e instanceof BadRequestException,
    )
  })

  it('rejects names over 120 characters', async () => {
    const svc = new TaskTemplatesService(buildDb(), tasksServiceStub, securityStub)
    await assert.rejects(
      () => svc.create(WORKSPACE_ID, ACTOR, { name: 'x'.repeat(121) }),
      (e) => e instanceof BadRequestException && /120 characters/.test((e as Error).message),
    )
  })

  it('rejects descriptions over 1000 characters', async () => {
    const svc = new TaskTemplatesService(buildDb(), tasksServiceStub, securityStub)
    await assert.rejects(
      () =>
        svc.create(WORKSPACE_ID, ACTOR, {
          name: 'Ok',
          description: 'd'.repeat(1001),
        }),
      (e) => e instanceof BadRequestException && /1000 characters/.test((e as Error).message),
    )
  })

  it('passes through a valid create call', async () => {
    const insertReturning = [
      {
        id: 'tpl-1',
        workspaceId: WORKSPACE_ID,
        name: 'My Template',
        description: null,
        icon: null,
        payload: {
          title: '',
          description: null,
          priority: 'normal',
          timeEstimate: null,
          startDateOffsetDays: null,
          dueDateOffsetDays: null,
          labels: [],
          checklists: [],
          subtasks: [],
          customFieldValues: [],
        },
        usageCount: 0,
        createdById: ACTOR.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    const svc = new TaskTemplatesService(buildDb({ insertReturning }), tasksServiceStub, securityStub)
    const created = await svc.create(WORKSPACE_ID, ACTOR, { name: 'My Template' })
    assert.equal(created.name, 'My Template')
    assert.equal(created.usageCount, 0)
  })
})

describe('TaskTemplatesService — payload normalisation', () => {
  // Reach the private normalisePayload through create() which calls it
  // for every payload merge. We assert against the returned view.
  async function makeViaCreate(payload: any) {
    const insertReturning = [
      {
        id: 'tpl-1',
        workspaceId: WORKSPACE_ID,
        name: 'T',
        description: null,
        icon: null,
        payload, // the DB stub returns whatever we set
        usageCount: 0,
        createdById: ACTOR.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    // We need to capture what was actually inserted to inspect the
    // normalised payload. Swap the stub so we can grab .values arg.
    let captured: any = null
    const db = {
      select: mock.fn(() => ({
        from: mock.fn(() => ({
          where: mock.fn(() => ({ limit: mock.fn(async () => []) })),
        })),
      })),
      insert: mock.fn(() => ({
        values: mock.fn((arg: any) => {
          captured = arg
          return { returning: mock.fn(async () => insertReturning) }
        }),
      })),
      update: mock.fn(() => ({ set: mock.fn(() => ({ where: mock.fn(() => ({ returning: mock.fn(async () => insertReturning) })) })) })),
      delete: mock.fn(() => ({ where: mock.fn(async () => undefined) })),
    } as any
    const svc = new TaskTemplatesService(db, tasksServiceStub, securityStub)
    await svc.create(WORKSPACE_ID, ACTOR, { name: 'T', payload })
    return captured.payload
  }

  it('coerces an unknown priority to "normal"', async () => {
    const p = await makeViaCreate({ priority: 'super-urgent' })
    assert.equal(p.priority, 'normal')
  })

  it('clamps negative time estimates to zero', async () => {
    const p = await makeViaCreate({ timeEstimate: -3600 })
    assert.equal(p.timeEstimate, 0)
  })

  it('drops non-string label entries and trims survivors', async () => {
    const p = await makeViaCreate({ labels: ['  bug  ', '', 42, null, '  feature  '] })
    assert.deepEqual(p.labels, ['bug', 'feature'])
  })

  it('caps checklists at 20 entries', async () => {
    const lots = Array.from({ length: 30 }, (_, i) => ({ title: `cl-${i}`, items: [] }))
    const p = await makeViaCreate({ checklists: lots })
    assert.equal(p.checklists.length, 20)
  })

  it('caps checklist items at 100 per checklist', async () => {
    const items = Array.from({ length: 250 }, (_, i) => ({ content: `i-${i}` }))
    const p = await makeViaCreate({ checklists: [{ title: 'big', items }] })
    assert.equal(p.checklists[0].items.length, 100)
  })

  it('caps subtasks at 100', async () => {
    const sub = Array.from({ length: 200 }, (_, i) => ({ title: `s-${i}` }))
    const p = await makeViaCreate({ subtasks: sub })
    assert.equal(p.subtasks.length, 100)
  })

  it('drops customFieldValues without a string fieldName', async () => {
    const p = await makeViaCreate({
      customFieldValues: [
        { fieldName: 'Severity', value: 'P1' },
        { fieldName: 42, value: 'nope' },
        { value: 'orphan' },
        { fieldName: 'Story Points', value: 8 },
        { fieldName: 'Bad', value: { nested: 'object' } }, // non-primitive → value coerced to null
      ],
    })
    assert.equal(p.customFieldValues.length, 3)
    const bad = p.customFieldValues.find((v: any) => v.fieldName === 'Bad')
    assert.equal(bad.value, null)
  })

  it('coerces non-finite numbers in timeEstimate to null', async () => {
    const p = await makeViaCreate({ timeEstimate: 'banana' })
    assert.equal(p.timeEstimate, null)
  })

  it('clamps offset days to the documented +/- 3650 range', async () => {
    const p = await makeViaCreate({ dueDateOffsetDays: 100_000 })
    assert.equal(p.dueDateOffsetDays, 3650)
  })
})

/*
 * `found-30-sep/templates-null-array-field-values` — a People, Labels or Tasks
 * field holds a LIST, and the payload's type was widened to `string[]` so that
 * a template would keep it. The normaliser kept only one-value shapes, so
 * every write stored the list as null: create, save from a task, and each
 * PATCH with a payload.
 */

/** A select that resolves to the next rows queued, however it is chained. */
function queuedSelects(queue: unknown[][]) {
  return mock.fn(() => {
    const rows = queue.shift() ?? []
    const q = Promise.resolve(rows) as any
    for (const step of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit', 'groupBy']) q[step] = () => q
    return q
  })
}

/** A database whose selects answer in order, and which keeps what was inserted and set. */
function recordingDb(selects: unknown[][], answer: Record<string, unknown> = {}) {
  const inserted: any[] = []
  const set: any[] = []
  const db = {
    select: queuedSelects([...selects]),
    insert: mock.fn(() => ({
      values: mock.fn((arg: any) => {
        inserted.push(arg)
        const done = Promise.resolve(undefined) as any
        done.returning = async () => [{ id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', usageCount: 0, ...answer, ...(Array.isArray(arg) ? {} : arg) }]
        return done
      }),
    })),
    update: mock.fn(() => ({
      set: mock.fn((arg: any) => {
        set.push(arg)
        const where = Promise.resolve(undefined) as any
        where.returning = async () => [{ id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', ...arg }]
        return { where: () => where }
      }),
    })),
    delete: mock.fn(() => ({ where: mock.fn(async () => undefined) })),
  } as any
  return { db, inserted, set }
}

const EMPTY = {
  title: '', description: null, priority: 'normal', timeEstimate: null, startDateOffsetDays: null,
  dueDateOffsetDays: null, labels: [], checklists: [], subtasks: [], customFieldValues: [],
}
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const T1 = '33333333-3333-4333-8333-333333333333'

describe('TaskTemplatesService — a list-valued custom field is kept (found-30-sep/templates-null-array-field-values)', () => {
  it('keeps a list of texts, as a People or Labels field holds it, beside a one-value field', async () => {
    const { db, inserted } = recordingDb([])
    await new TaskTemplatesService(db, tasksServiceStub, securityStub).create(WORKSPACE_ID, ACTOR, {
      name: 'T',
      payload: { customFieldValues: [{ fieldName: 'People', value: ['u1', 'u2'] }, { fieldName: 'Budget', value: 5 }] },
    })
    assert.deepEqual(inserted[0].payload.customFieldValues, [
      { fieldName: 'People', value: ['u1', 'u2'] },
      { fieldName: 'Budget', value: 5 },
    ])
  })

  it('still turns a list that holds anything but text into null, as it does an object', async () => {
    const { db, inserted } = recordingDb([])
    await new TaskTemplatesService(db, tasksServiceStub, securityStub).create(WORKSPACE_ID, ACTOR, {
      name: 'T',
      payload: {
        customFieldValues: [
          { fieldName: 'Mixed', value: ['u1', 7] },
          { fieldName: 'Objects', value: [{ id: 'u1' }] },
          { fieldName: 'Object', value: { v: ['u1'] } },
        ] as any,
      },
    })
    assert.deepEqual(inserted[0].payload.customFieldValues.map((v: any) => v.value), [null, null, null])
  })

  it('keeps the lists through an update, which merges the payload it is sent over the one held and shapes it again', async () => {
    const held = {
      id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', description: null, icon: null, usageCount: 0,
      createdById: ACTOR.id, createdAt: new Date(), updatedAt: new Date(),
      payload: { ...EMPTY, customFieldValues: [{ fieldName: 'People', value: [U1, U2] }, { fieldName: 'Tags', value: ['red'] }] },
    }
    const { db, set } = recordingDb([[held]])
    await new TaskTemplatesService(db, tasksServiceStub, securityStub).update(WORKSPACE_ID, 'tpl-1', ACTOR, {
      payload: { title: 'Corrected from the create modal' },
    })
    assert.equal(set[0].payload.title, 'Corrected from the create modal')
    assert.deepEqual(set[0].payload.customFieldValues, [
      { fieldName: 'People', value: [U1, U2] },
      { fieldName: 'Tags', value: ['red'] },
    ])
  })

  it('keeps a task\'s People and Labels lists when it is saved as a template, and leaves out its votes and files', async () => {
    const task = { title: 'Launch', description: null, priority: 'high', timeEstimate: null, startDate: null, dueDate: null }
    const values = [
      { name: 'People', type: 'people', value: { v: [U1, U2] } },
      { name: 'Tags', type: 'labels', value: { v: ['red', 'blue'] } },
      { name: 'Votes', type: 'voting', value: { v: [U1] } },
      { name: 'Files', type: 'files', value: { v: ['attachment-1'] } },
      { name: 'Budget', type: 'number', value: { v: 5 } },
    ]
    // The task's place, the read rule's two reads (the task where it lives, the caller's role), then the task,
    // its labels, checklists, subtasks and values, in the order they are read.
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [task], [], [], [], values,
    ])
    await new TaskTemplatesService(db, tasksServiceStub, securityStub).saveFromTask(WORKSPACE_ID, T1, ACTOR, { name: 'From a task' })
    assert.deepEqual(inserted[0].payload.customFieldValues, [
      { fieldName: 'People', value: [U1, U2] },
      { fieldName: 'Tags', value: ['red', 'blue'] },
      { fieldName: 'Budget', value: 5 },
    ])
  })
})

describe('fitTemplateValue — a template\'s value, onto the field of that name in the new task\'s project', () => {
  const known = { members: new Set([U1]), tasks: new Set([T1]) }

  it('writes a People list with only the people who are members of the workspace now, each once', () => {
    assert.deepEqual(fitTemplateValue({ type: 'people' }, [U1, U2, U1], known), [U1])
    assert.equal(fitTemplateValue({ type: 'people' }, [U2], known), undefined)
  })

  it('writes a Labels list with only the options that field defines, and nothing when none is left', () => {
    const field = { type: 'labels', options: [{ value: 'red' }, { value: 'blue' }] }
    assert.deepEqual(fitTemplateValue(field, ['blue', 'green', 'red'], known), ['blue', 'red'])
    assert.equal(fitTemplateValue(field, ['green'], known), undefined)
  })

  it('writes a Tasks list with only tasks in the workspace', () => {
    assert.deepEqual(fitTemplateValue({ type: 'tasks' }, [T1, U2], known), [T1])
  })

  it('never writes a template\'s votes or files onto a task', () => {
    assert.equal(fitTemplateValue({ type: 'voting' }, [U1], known), undefined)
    assert.equal(fitTemplateValue({ type: 'files' }, [T1], known), undefined)
  })

  it('never writes a list into a one-value field, nor one value into a list field', () => {
    assert.equal(fitTemplateValue({ type: 'text' }, ['a', 'b'], known), undefined)
    assert.equal(fitTemplateValue({ type: 'people' }, U1, known), undefined)
  })

  it('writes one value into a one-value field as it always has, and nothing for none', () => {
    assert.equal(fitTemplateValue({ type: 'number' }, 5, known), 5)
    assert.equal(fitTemplateValue({ type: 'text' }, 'P1', known), 'P1')
    assert.equal(fitTemplateValue({ type: 'text' }, null, known), undefined)
  })
})

describe('TaskTemplatesService.instantiate — the template\'s lists reach the task made from it', () => {
  it('writes the People list less anybody who has left the workspace, the Labels list, and no votes', async () => {
    const template = {
      id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', description: null, icon: null, usageCount: 0,
      createdById: ACTOR.id, createdAt: new Date(), updatedAt: new Date(),
      payload: {
        ...EMPTY,
        customFieldValues: [
          { fieldName: 'People', value: [U1, U2, 'not-an-id'] },
          { fieldName: 'Tags', value: ['red', 'blue'] },
          { fieldName: 'Votes', value: [U1] },
          { fieldName: 'Nowhere', value: ['x'] },
        ],
      },
    }
    const defs = [
      { id: 'f-people', name: 'People', type: 'people', options: null },
      { id: 'f-tags', name: 'Tags', type: 'labels', options: [{ value: 'red' }, { value: 'blue' }] },
      { id: 'f-votes', name: 'Votes', type: 'voting', options: null },
    ]
    // The template, the list's place, the fields, then who of those named is still a member (U2 has left),
    // and then the field route's own check of the People list about to be written (`checkValue`).
    const { db, inserted } = recordingDb([[template], [{ workspaceId: WORKSPACE_ID, projectId: 'p' }], defs, [{ id: U1 }], [{ userId: U1 }]])
    const createTask = mock.fn(async () => ({ id: 'task-9' }))
    await new TaskTemplatesService(db, { createTask } as any, securityStub).instantiate(WORKSPACE_ID, 'tpl-1', ACTOR, {
      listId: 'l',
    })
    assert.deepEqual(inserted[0], [
      { taskId: 'task-9', fieldId: 'f-people', value: { v: [U1] } },
      { taskId: 'task-9', fieldId: 'f-tags', value: { v: ['red', 'blue'] } },
    ])
  })
})

/*
 * `found-30-sep/template-values-written-unchecked` — a template's ONE value was
 * written into the field of its name whatever that field takes. Every value is
 * now asked of the field route's own rules (`CustomFieldsService.checkValue`),
 * and one the route would refuse is not written.
 */
describe('TaskTemplatesService.instantiate — one value, only where the field of its name would take it (found-30-sep/template-values-written-unchecked)', () => {
  it('writes no words into a Number field, no option a Dropdown does not define and no words into an Email field, and writes the values its fields can hold', async () => {
    const template = {
      id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', description: null, icon: null, usageCount: 0,
      createdById: ACTOR.id, createdAt: new Date(), updatedAt: new Date(),
      payload: {
        ...EMPTY,
        customFieldValues: [
          { fieldName: 'Estimate', value: 'about a week' },
          { fieldName: 'Severity', value: 'critical' },
          { fieldName: 'Contact', value: 'the front desk' },
          { fieldName: 'Note', value: 'kept' },
          { fieldName: 'Budget', value: 5 },
          { fieldName: 'Priority', value: 'high' },
        ],
      },
    }
    const defs = [
      { id: 'f-estimate', name: 'Estimate', type: 'number', options: null },
      { id: 'f-severity', name: 'Severity', type: 'dropdown', options: [{ value: 'low' }, { value: 'high' }] },
      { id: 'f-contact', name: 'Contact', type: 'email', options: null },
      { id: 'f-note', name: 'Note', type: 'text', options: null },
      { id: 'f-budget', name: 'Budget', type: 'number', options: null },
      { id: 'f-priority', name: 'Priority', type: 'dropdown', options: [{ value: 'low' }, { value: 'high' }] },
    ]
    // The template, the list's place, the fields; no list names anybody, so nothing more is asked.
    const { db, inserted } = recordingDb([[template], [{ workspaceId: WORKSPACE_ID, projectId: 'p' }], defs])
    const createTask = mock.fn(async () => ({ id: 'task-9' }))
    await new TaskTemplatesService(db, { createTask } as any, securityStub).instantiate(WORKSPACE_ID, 'tpl-1', ACTOR, {
      listId: 'l',
    })
    assert.deepEqual(inserted[0], [
      { taskId: 'task-9', fieldId: 'f-note', value: { v: 'kept' } },
      { taskId: 'task-9', fieldId: 'f-budget', value: { v: 5 } },
      { taskId: 'task-9', fieldId: 'f-priority', value: { v: 'high' } },
    ])
  })
})

/*
 * `found-30-sep/duplicate-copies-votes-and-files` — a duplicate wrote every value
 * the task held onto its copy, unchecked: votes its voters never cast on the
 * copy, and a Files value naming the original's attachments. The copy's values
 * are now written as a template's are.
 */
/*
 * What the task's read rule reads before a task is copied
 * (`found-30-sep/duplicate-reads-what-its-caller-cannot`): the task where it
 * lives, then the caller's role in the workspace. An admin opens it.
 */
const READABLE = [
  [{ taskId: T1, listId: 'l', taskVisibility: 'public', taskCreatedById: ACTOR.id, listVisibility: 'public', listCreatedById: ACTOR.id, projectId: 'p', projectVisibility: 'public', spaceId: 's', spaceVisibility: 'public' }],
  [{ role: 'workspace_admin' }],
]

describe('TaskTemplatesService — a task its caller may not open is not copied (found-30-sep/duplicate-reads-what-its-caller-cannot)', () => {
  it('refuses to duplicate a task the read rule does not find for its caller, and makes nothing', async () => {
    // The task's place, then the read rule's first read, which finds no task this caller may open.
    const { db, inserted } = recordingDb([[{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }], []])
    const createTask = mock.fn(async () => ({ id: 'copy-1' }))
    await assert.rejects(
      new TaskTemplatesService(db, { createTask } as any, securityStub).duplicateTask(WORKSPACE_ID, T1, ACTOR),
      /Task not found in this workspace/,
    )
    assert.equal(createTask.mock.callCount(), 0)
    assert.equal(inserted.length, 0)
  })

  it('refuses to save such a task as a template, and saves nothing', async () => {
    const { db, inserted } = recordingDb([[{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }], []])
    await assert.rejects(
      new TaskTemplatesService(db, tasksServiceStub, securityStub).saveFromTask(WORKSPACE_ID, T1, ACTOR, { name: 'From a hidden task' }),
      /Task not found in this workspace/,
    )
    assert.equal(inserted.length, 0)
  })
})

describe('TaskTemplatesService.duplicateTask — the copy carries no votes and no files (found-30-sep/duplicate-copies-votes-and-files)', () => {
  it('writes the copy the values its fields can hold, and none of the original’s votes or files', async () => {
    const task = { title: 'Launch', description: null, priority: 'high', timeEstimate: null, startDate: null, dueDate: null }
    const values = [
      { name: 'People', type: 'people', value: { v: [U1] } },
      { name: 'Tags', type: 'labels', value: { v: ['red'] } },
      { name: 'Votes', type: 'voting', value: { v: [U1] } },
      { name: 'Files', type: 'files', value: { v: ['attachment-1'] } },
      { name: 'Budget', type: 'number', value: { v: 5 } },
    ]
    const defs = [
      { id: 'f-people', name: 'People', type: 'people', options: null },
      { id: 'f-tags', name: 'Tags', type: 'labels', options: [{ value: 'red' }] },
      { id: 'f-votes', name: 'Votes', type: 'voting', options: null },
      { id: 'f-files', name: 'Files', type: 'files', options: null },
      { id: 'f-budget', name: 'Budget', type: 'number', options: null },
    ]
    // The task's place, its dates and assignees; the task, its labels, checklists, subtasks and values; then its
    // project's fields, who of those named is a member, and the field route's own check of the People list.
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [{ startDate: null, dueDate: null }], [],
      [task], [], [], [], values,
      defs, [{ id: U1 }], [{ userId: U1 }],
    ])
    const createTask = mock.fn(async () => ({ id: 'copy-1' }))
    await new TaskTemplatesService(db, { createTask } as any, securityStub).duplicateTask(WORKSPACE_ID, T1, ACTOR)
    assert.deepEqual(inserted[0], [
      { taskId: 'copy-1', fieldId: 'f-people', value: { v: [U1] } },
      { taskId: 'copy-1', fieldId: 'f-tags', value: { v: ['red'] } },
      { taskId: 'copy-1', fieldId: 'f-budget', value: { v: 5 } },
    ])
  })
})

describe('TaskTemplatesService.requireTemplate', () => {
  it('throws NotFound for an unknown id', async () => {
    const svc = new TaskTemplatesService(
      buildDb({ selectQueues: [[]] }),
      tasksServiceStub,
      securityStub,
    )
    await assert.rejects(
      () => svc.getById(WORKSPACE_ID, '00000000-0000-0000-0000-000000000099'),
      (e) => e instanceof NotFoundException,
    )
  })
})
