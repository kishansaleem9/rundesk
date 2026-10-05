import { BadRequestException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { TaskTemplatesService, fitTemplateValue, templateWithForm } from './task-templates.service'
import { CreateTaskDto } from '../tasks/dto/task.dto'

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
/**
 * Where a value row's field is, as the snapshot reads it beside the value: here,
 * a field of the task's project ('p') for the whole project. The snapshot takes
 * only the values of the fields the task has (`fieldIsOnTask`).
 */
const ON_TASK = { projectId: 'p', listId: null }
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
      { name: 'People', type: 'people', value: { v: [U1, U2] }, ...ON_TASK },
      { name: 'Tags', type: 'labels', value: { v: ['red', 'blue'] }, ...ON_TASK },
      { name: 'Votes', type: 'voting', value: { v: [U1] }, ...ON_TASK },
      { name: 'Files', type: 'files', value: { v: ['attachment-1'] }, ...ON_TASK },
      { name: 'Budget', type: 'number', value: { v: 5 }, ...ON_TASK },
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
      { name: 'People', type: 'people', value: { v: [U1] }, ...ON_TASK },
      { name: 'Tags', type: 'labels', value: { v: ['red'] }, ...ON_TASK },
      { name: 'Votes', type: 'voting', value: { v: [U1] }, ...ON_TASK },
      { name: 'Files', type: 'files', value: { v: ['attachment-1'] }, ...ON_TASK },
      { name: 'Budget', type: 'number', value: { v: 5 }, ...ON_TASK },
    ]
    const defs = [
      { id: 'f-people', name: 'People', type: 'people', options: null },
      { id: 'f-tags', name: 'Tags', type: 'labels', options: [{ value: 'red' }] },
      { id: 'f-votes', name: 'Votes', type: 'voting', options: null },
      { id: 'f-files', name: 'Files', type: 'files', options: null },
      { id: 'f-budget', name: 'Budget', type: 'number', options: null },
    ]
    // The task's place, its dates, assignees and tags; the task, its labels, checklists, subtasks and values; then its
    // project's fields, who of those named is a member, and the field route's own check of the People list.
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [{ startDate: null, dueDate: null }], [], [],
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

/*
 * `found-30-sep/template-values-find-fields-by-name-alone` — a template's values
 * were mapped by name over every field of the project: one went into a field
 * scoped to another list, which the new task does not have, or into whichever
 * of two fields of one name came back last; and a duplicate of a task whose two
 * fields of one name were both set wrote both into one field, which the table
 * refuses (409, and a copy with none of its values). Each value now goes into a
 * field the task has — by the field it came from, else by name, its own list's
 * over the project's, neither of two at the same reach — and each field once.
 */
describe('TaskTemplatesService — each value into a field the new task has (found-30-sep/template-values-find-fields-by-name-alone)', () => {
  const F_STAGE = '55555555-5555-4555-8555-555555555555'
  const F_STAGE_L2 = '66666666-6666-4666-8666-666666666666'
  const templateOf = (customFieldValues: unknown[]) => ({
    id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', description: null, icon: null, usageCount: 0,
    createdById: ACTOR.id, createdAt: new Date(), updatedAt: new Date(),
    payload: { ...EMPTY, customFieldValues },
  })
  const text = (id: string, name: string, listId: string | null) => ({ id, name, type: 'text', options: null, listId })
  /** What instantiating in `listId` writes, with these fields in the list's project. */
  const applied = async (values: unknown[], defs: unknown[], listId: string) => {
    // The template, the list's place, then the project's fields.
    const { db, inserted } = recordingDb([[templateOf(values)], [{ workspaceId: WORKSPACE_ID, projectId: 'p' }], defs])
    await new TaskTemplatesService(db, { createTask: mock.fn(async () => ({ id: 'task-9' })) } as any, securityStub)
      .instantiate(WORKSPACE_ID, 'tpl-1', ACTOR, { listId })
    return inserted[0] ?? []
  }

  it('writes a value only into a field the new task has: none into a field scoped to another list, and a name shared with such a field into the project’s own', async () => {
    const written = await applied(
      [{ fieldName: 'Scope', value: 'scoped' }, { fieldName: 'Stage', value: 'staged' }],
      [text('f-scope', 'Scope', 'l2'), text('f-stage-l2', 'Stage', 'l2'), text('f-stage', 'Stage', null)],
      'l1',
    )
    assert.deepEqual(written, [{ taskId: 'task-9', fieldId: 'f-stage', value: { v: 'staged' } }])
  })

  it('between two fields of one name the task has, writes into the one scoped to its own list, and into neither when both are the project’s', async () => {
    const own = await applied(
      [{ fieldName: 'Stage', value: 'staged' }],
      [text('f-stage-l2', 'Stage', 'l2'), text('f-stage', 'Stage', null)],
      'l2',
    )
    assert.deepEqual(own, [{ taskId: 'task-9', fieldId: 'f-stage-l2', value: { v: 'staged' } }])
    const neither = await applied(
      [{ fieldName: 'Stage', value: 'staged' }],
      [text('f-stage-a', 'Stage', null), text('f-stage-b', 'Stage', null)],
      'l2',
    )
    assert.deepEqual(neither, [])
  })

  it('writes a value taken from a field back into that field where the new task has it, and each field once', async () => {
    const values = [
      { fieldId: F_STAGE, fieldName: 'Stage', value: 'project value' },
      { fieldId: F_STAGE_L2, fieldName: 'Stage', value: 'list value' },
    ]
    const defs = [text(F_STAGE_L2, 'Stage', 'l2'), text(F_STAGE, 'Stage', null)]
    assert.deepEqual(await applied(values, defs, 'l2'), [
      { taskId: 'task-9', fieldId: F_STAGE, value: { v: 'project value' } },
      { taskId: 'task-9', fieldId: F_STAGE_L2, value: { v: 'list value' } },
    ])
    // Where the list's field is not the task's, its value falls to the name, whose field the other already holds.
    assert.deepEqual(await applied(values, defs, 'l1'), [
      { taskId: 'task-9', fieldId: F_STAGE, value: { v: 'project value' } },
    ])
  })

  it('a duplicate copies each value into the field it came from, where two of its fields share a name', async () => {
    const task = { title: 'Launch', description: null, priority: 'high', timeEstimate: null, startDate: null, dueDate: null }
    const values = [
      { fieldId: F_STAGE, name: 'Stage', type: 'text', value: { v: 'project value' }, ...ON_TASK },
      { fieldId: F_STAGE_L2, name: 'Stage', type: 'text', value: { v: 'list value' }, projectId: 'p', listId: 'l' },
    ]
    // The task's place, the read rule's two reads, its dates, assignees and tags; the task, its labels, checklists,
    // subtasks and values; then its project's fields.
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [{ startDate: null, dueDate: null }], [], [],
      [task], [], [], [], values,
      [text(F_STAGE, 'Stage', null), text(F_STAGE_L2, 'Stage', 'l')],
    ])
    await new TaskTemplatesService(db, { createTask: mock.fn(async () => ({ id: 'copy-1' })) } as any, securityStub).duplicateTask(WORKSPACE_ID, T1, ACTOR)
    assert.deepEqual(inserted[0], [
      { taskId: 'copy-1', fieldId: F_STAGE, value: { v: 'project value' } },
      { taskId: 'copy-1', fieldId: F_STAGE_L2, value: { v: 'list value' } },
    ])
  })

  it('a template saved from a task names the field each value came from, beside its name', async () => {
    const task = { title: 'Launch', description: null, priority: 'high', timeEstimate: null, startDate: null, dueDate: null }
    const values = [
      { fieldId: F_STAGE, name: 'Stage', type: 'text', value: { v: 'project value' }, ...ON_TASK },
      { fieldId: F_STAGE_L2, name: 'Stage', type: 'text', value: { v: 'list value' }, projectId: 'p', listId: 'l' },
    ]
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [task], [], [], [], values,
    ])
    await new TaskTemplatesService(db, tasksServiceStub, securityStub).saveFromTask(WORKSPACE_ID, T1, ACTOR, { name: 'From a task' })
    assert.deepEqual(inserted[0].payload.customFieldValues, [
      { fieldId: F_STAGE, fieldName: 'Stage', value: 'project value' },
      { fieldId: F_STAGE_L2, fieldName: 'Stage', value: 'list value' },
    ])
  })

  /*
   * A task keeps its value rows when it is moved (`moveTask` changes its list
   * alone), so a task in list 'l' of project 'p' may still hold a value for the
   * Stage of list 'l2' it was moved out of, or for the Budget of project 'p2' it
   * was moved in from — fields it no longer has, which nobody sees on it. The
   * snapshot took every row, and each such value fell to the field of its name
   * the copy has: the copy showed the project's Stage or Budget holding what the
   * original showed empty, and a template saved from the task carried both.
   */
  const F_NOTE = '77777777-7777-4777-8777-777777777777'
  const F_BUDGET = '88888888-8888-4888-8888-888888888888'
  const F_BUDGET_P2 = '99999999-9999-4999-8999-999999999999'
  const moved = { title: 'Moved', description: null, priority: 'normal', timeEstimate: null, startDate: null, dueDate: null }
  const note = { fieldId: F_NOTE, name: 'Note', type: 'text', value: { v: 'kept' }, ...ON_TASK }
  const stageOfL2 = { fieldId: F_STAGE_L2, name: 'Stage', type: 'text', value: { v: 'hidden draft' }, projectId: 'p', listId: 'l2' }
  const budgetOfP2 = { fieldId: F_BUDGET_P2, name: 'Budget', type: 'number', value: { v: 5 }, projectId: 'p2', listId: null }
  /** The fields of project 'p': a Note, a Stage and a Budget for the whole project, and the Stage of list 'l2'. */
  const fieldsOfP = [
    text(F_NOTE, 'Note', null), text(F_STAGE, 'Stage', null), text(F_STAGE_L2, 'Stage', 'l2'),
    { id: F_BUDGET, name: 'Budget', type: 'number', options: null, listId: null },
  ]
  /** What a duplicate of the task in list 'l', holding these rows, writes onto its copy. */
  const duplicated = async (values: unknown[]) => {
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [{ startDate: null, dueDate: null }], [], [],
      [moved], [], [], [], values,
      fieldsOfP,
    ])
    await new TaskTemplatesService(db, { createTask: mock.fn(async () => ({ id: 'copy-1' })) } as any, securityStub).duplicateTask(WORKSPACE_ID, T1, ACTOR)
    return inserted[0] ?? []
  }

  it('a duplicate of a task moved out of a field’s list copies none of that field’s value — not into the project’s field of its name — and copies the fields it has', async () => {
    assert.deepEqual(await duplicated([note, stageOfL2]), [{ taskId: 'copy-1', fieldId: F_NOTE, value: { v: 'kept' } }])
  })

  it('nor a value of the project the task was moved in from, into this project’s field of its name', async () => {
    assert.deepEqual(await duplicated([note, budgetOfP2]), [{ taskId: 'copy-1', fieldId: F_NOTE, value: { v: 'kept' } }])
  })

  it('a template saved from such a task holds only the values of the fields it has, not those of its old list or its old project', async () => {
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [moved], [], [], [], [note, stageOfL2, budgetOfP2],
    ])
    await new TaskTemplatesService(db, tasksServiceStub, securityStub).saveFromTask(WORKSPACE_ID, T1, ACTOR, { name: 'From a moved task' })
    assert.deepEqual(inserted[0].payload.customFieldValues, [{ fieldId: F_NOTE, fieldName: 'Note', value: 'kept' }])
  })
})

/*
 * `found-30-sep/template-submit-ignores-the-form` — with a template chosen in the
 * create modal, Create task sent the route the list and the title alone, and
 * the priority, description, dates, estimate, tags, task type and assignees
 * typed into the same form were dropped without a word. What the person set
 * wins over the template's one values, a typed description comes before the
 * template's, and tags and assignees are the two together; what they left
 * alone is the template's (`templateWithForm`).
 */
describe('TaskTemplatesService.instantiate — what the person set beside the template (found-30-sep/template-submit-ignores-the-form)', () => {
  const TYPE = '44444444-4444-4444-8444-444444444444'
  const templateOf = (payload: Record<string, unknown>) => ({
    id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', description: null, icon: null, usageCount: 0,
    createdById: ACTOR.id, createdAt: new Date(), updatedAt: new Date(),
    payload: {
      ...EMPTY, title: 'From the template', description: 'The template body', priority: 'low', timeEstimate: 3600,
      startDateOffsetDays: 2, dueDateOffsetDays: 10, labels: ['tpl-tag'],
      checklists: [{ title: 'Steps', items: [{ content: 'Step one' }] }],
      subtasks: [{ title: 'Sub', description: null, priority: 'normal', timeEstimate: null, dueDateOffsetDays: null }],
      ...payload,
    },
  })
  /** The task `createTask` was asked for, the subtasks after it, and what was inserted. */
  const made = async (form: Record<string, unknown>, payload: Record<string, unknown> = {}) => {
    // The template and the list's place: its tags are handed to `createTask` by name, not looked up here.
    const { db, inserted } = recordingDb([
      [templateOf(payload)],
      [{ workspaceId: WORKSPACE_ID, projectId: 'p' }],
    ])
    const createTask = mock.fn(async (_arg: any) => ({ id: 'task-9' }))
    await new TaskTemplatesService(db, { createTask } as any, securityStub).instantiate(WORKSPACE_ID, 'tpl-1', ACTOR, {
      listId: 'l',
      ...form,
    })
    const calls = createTask.mock.calls.map((c) => c.arguments[0])
    return { task: calls[0], subtasks: calls.slice(1), inserted }
  }
  const daysFromNow = (d: Date | undefined) => (d ? Math.round((d.getTime() - Date.now()) / 86_400_000) : null)

  it('lets the priority, task type, start and due dates and estimate set in the form win over the template’s, leaves each one not set to the template, and still makes its checklist and subtask', async () => {
    const all = await made({
      priority: 'high',
      taskTypeId: TYPE,
      startDate: '2026-10-02T09:00:00.000Z',
      dueDate: '2026-10-03T17:00:00.000Z',
      timeEstimate: 5400,
    })
    assert.equal(all.task.priority, 'high')
    assert.equal(all.task.taskTypeId, TYPE)
    assert.equal(all.task.startDate?.toISOString(), '2026-10-02T09:00:00.000Z')
    assert.equal(all.task.dueDate?.toISOString(), '2026-10-03T17:00:00.000Z')
    assert.equal(all.task.timeEstimate, 5400)
    assert.deepEqual(all.inserted[0], { taskId: 'task-9', title: 'Steps', position: 0 })
    assert.deepEqual(all.subtasks.map((s) => [s.title, s.parentTaskId]), [['Sub', 'task-9']])
    // The priority alone set: the rest is the template's, the dates as days from now, the type the list's own.
    const one = await made({ priority: 'urgent' })
    assert.equal(one.task.priority, 'urgent')
    assert.equal(one.task.timeEstimate, 3600)
    assert.equal(one.task.taskTypeId, undefined)
    assert.equal(daysFromNow(one.task.startDate), 2)
    assert.equal(daysFromNow(one.task.dueDate), 10)
  })

  it('puts a typed description first and the template’s after it, and either alone as it is', async () => {
    assert.equal((await made({ description: '  Typed body  ' })).task.description, 'Typed body\n\nThe template body')
    assert.equal((await made({ description: 'Typed body' }, { description: null })).task.description, 'Typed body')
    assert.equal((await made({ description: '   ' })).task.description, 'The template body')
  })

  /*
   * The template's tags go to `createTask` BY NAME, beside the names typed with
   * it (`found-30-sep/refused-create-leaves-tags`): `createTask` finds each once,
   * whatever its case, and makes the rest only once the task is made.
   */
  it('makes the tags the template’s and the form’s together, each once, and assigns each person set once', async () => {
    const { task, inserted } = await made({
      labelIds: ['label-typed', 'label-typed'],
      labelsByName: [{ name: 'typed-tag', color: '#ff0000' }],
      assigneeIds: [U1, U2, U1],
    })
    assert.deepEqual(task.labelIds, ['label-typed'])
    assert.deepEqual(task.labelsByName, [{ name: 'tpl-tag', color: '#94a3b8' }, { name: 'typed-tag', color: '#ff0000' }])
    assert.deepEqual(task.assigneeIds, [U1, U2])
    // No tag is made here: what was inserted is the template's checklist and its items alone.
    assert.equal(inserted.some((row) => (Array.isArray(row) ? row : [row]).some((r: any) => 'color' in r)), false)
  })
})

/*
 * `found-30-sep/refused-create-leaves-tags` — a template's missing tags were made
 * BEFORE `createTask` asked about the list, the type, the people and the tags, so
 * a create it refused left them in the workspace. Now nothing is written before
 * `createTask` answers.
 */
describe('TaskTemplatesService.instantiate — a refused create makes no tag (found-30-sep/refused-create-leaves-tags)', () => {
  it('writes nothing at all when createTask refuses the task: no tag, no checklist, no count', async () => {
    const template = {
      id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', description: null, icon: null, usageCount: 0,
      createdById: ACTOR.id, createdAt: new Date(), updatedAt: new Date(),
      payload: { ...EMPTY, title: 'Tagged', labels: ['not-yet-a-tag'], checklists: [{ title: 'Steps', items: [{ content: 'One' }] }] },
    }
    const { db, inserted, set } = recordingDb([[template], [{ workspaceId: WORKSPACE_ID, projectId: 'p' }]])
    const createTask = mock.fn(async () => { throw new BadRequestException('That task type does not belong to this workspace') })
    await assert.rejects(
      new TaskTemplatesService(db, { createTask } as any, securityStub).instantiate(WORKSPACE_ID, 'tpl-1', ACTOR, {
        listId: 'l', taskTypeId: '44444444-4444-4444-8444-444444444444',
      }),
      /does not belong/,
    )
    assert.equal(createTask.mock.callCount(), 1)
    assert.equal(inserted.length, 0, `inserted ${JSON.stringify(inserted)}`)
    assert.equal(set.length, 0)
    assert.equal(db.insert.mock.callCount(), 0)
  })

  it('duplicates a task with its own tags by id, and hands createTask no tag to make', async () => {
    const task = { title: 'Tagged', description: null, priority: 'normal', timeEstimate: null, startDate: null, dueDate: null }
    // The task's place, the read rule, its dates, assignees and tags (by id); the task, its label names, checklists, subtasks and values.
    const { db, inserted } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [{ startDate: null, dueDate: null }], [], [{ labelId: 'label-a' }, { labelId: 'label-b' }],
      [task], [{ name: 'A' }, { name: 'B' }], [], [], [],
    ])
    const createTask = mock.fn(async (_arg: any) => ({ id: 'copy-1' }))
    await new TaskTemplatesService(db, { createTask } as any, securityStub).duplicateTask(WORKSPACE_ID, T1, ACTOR)
    const asked = createTask.mock.calls[0]?.arguments[0]
    assert.deepEqual(asked?.labelIds, ['label-a', 'label-b'])
    assert.equal(asked?.labelsByName, undefined)
    assert.equal(inserted.length, 0)
  })
})

/*
 * EACH DATE IS THE FORM'S WHERE IT WAS SET AND THE TEMPLATE'S WHERE IT WAS NOT,
 * whichever way round the two then fall (the owner's decision of 1 October on
 * `found-30-sep/a-task-starts-after-it-is-due`).
 */
describe('templateWithForm — a date set wins over the template’s, and the other date is the template’s', () => {
  const NOW = new Date('2026-09-30T12:00:00.000Z')
  const base = { description: null, priority: 'normal' as const, timeEstimate: null, labels: [] as string[] }
  it('keeps the template’s start beside a typed due date before it, and its due date beside a typed start after it, and passes two typed dates on as typed', () => {
    const late = templateWithForm({ ...base, startDateOffsetDays: 9, dueDateOffsetDays: null }, { dueDate: '2026-10-03T12:00:00.000Z' }, NOW)
    assert.equal(late.startDate?.toISOString(), '2026-10-09T12:00:00.000Z')
    assert.equal(late.dueDate?.toISOString(), '2026-10-03T12:00:00.000Z')
    const early = templateWithForm({ ...base, startDateOffsetDays: null, dueDateOffsetDays: 2 }, { startDate: '2026-10-09T12:00:00.000Z' }, NOW)
    assert.equal(early.startDate?.toISOString(), '2026-10-09T12:00:00.000Z')
    assert.equal(early.dueDate?.toISOString(), '2026-10-02T12:00:00.000Z')
    const typed = templateWithForm({ ...base, startDateOffsetDays: null, dueDateOffsetDays: null }, { startDate: '2026-10-10T12:00:00.000Z', dueDate: '2026-10-03T12:00:00.000Z' }, NOW)
    assert.equal(typed.startDate?.toISOString(), '2026-10-10T12:00:00.000Z')
    assert.equal(typed.dueDate?.toISOString(), '2026-10-03T12:00:00.000Z')
  })
})

/*
 * A DUPLICATE COPIES EACH ESTIMATE AS IT IS HELD, the task's and each subtask's,
 * one below nought among them (the owner's decision of 1 October on
 * `found-30-sep/task-estimate-below-zero`).
 */
describe('TaskTemplatesService.duplicateTask — each estimate copied as it is held', () => {
  it('copies the task’s estimate and its subtask’s as they are held, below nought among them, and records the duplicate', async () => {
    const task = { title: 'Launch', description: null, priority: 'normal', timeEstimate: -600, startDate: null, dueDate: null }
    const sub = { title: 'Sub', description: null, priority: 'normal', timeEstimate: -60, dueDate: null }
    // The task's place, the read rule, its dates, assignees and tags; the task, its label names, checklists, subtasks and values.
    const { db } = recordingDb([
      [{ workspaceId: WORKSPACE_ID, spaceId: 's', projectId: 'p', listId: 'l' }],
      ...READABLE,
      [{ startDate: null, dueDate: null }], [], [],
      [task], [], [], [sub], [],
    ])
    const createTask = mock.fn(async (arg: any) => ({ id: arg.parentTaskId ? 'copy-sub' : 'copy-1' }))
    const audit = mock.fn(async () => undefined)
    const answer = await new TaskTemplatesService(db, { createTask } as any, { logAuditEvent: audit } as any).duplicateTask(WORKSPACE_ID, T1, ACTOR)
    assert.equal(answer.taskId, 'copy-1')
    const asked = createTask.mock.calls.map((c) => c.arguments[0])
    assert.deepEqual(asked.map((a) => [a.title, a.parentTaskId, a.timeEstimate]), [['Launch (copy)', undefined, -600], ['Sub', 'copy-1', -60]])
    assert.equal(audit.mock.callCount(), 1)
  })
})

/*
 * A TEMPLATE MAY START AFTER IT IS DUE, made so or changed so, as a task may
 * (the owner's decision of 1 October on `found-30-sep/a-task-starts-after-it-is-due`).
 */
describe('TaskTemplatesService — a template whose start is after its due date is kept', () => {
  it('makes and changes a template whose start date is after its due date, keeping both offsets', async () => {
    const { db, inserted, set } = recordingDb([[{ id: 'tpl-1', workspaceId: WORKSPACE_ID, name: 'T', payload: { ...EMPTY } }]])
    const svc = new TaskTemplatesService(db, tasksServiceStub, securityStub)
    const made = await svc.create(WORKSPACE_ID, ACTOR, { name: 'Late', payload: { startDateOffsetDays: 9, dueDateOffsetDays: 3 } })
    assert.deepEqual([made.payload.startDateOffsetDays, made.payload.dueDateOffsetDays], [9, 3])
    assert.deepEqual([inserted[0]?.payload?.startDateOffsetDays, inserted[0]?.payload?.dueDateOffsetDays], [9, 3])
    await svc.update(WORKSPACE_ID, 'tpl-1', ACTOR, { payload: { startDateOffsetDays: 4, dueDateOffsetDays: 1 } })
    assert.deepEqual([set[0]?.payload?.startDateOffsetDays, set[0]?.payload?.dueDateOffsetDays], [4, 1])
  })
})

/*
 * THE ROUTE'S BODY, CHECKED AS `POST /tasks` CHECKS THE SAME FIELDS. The body was
 * an untyped shape, which the global ValidationPipe does not validate (a plain
 * `Object`), so nothing in it was checked. Which class the route declares is
 * read from the controller, as `create-task-wiring.test.ts` reads `POST /tasks`:
 * the metadata Nest reads it from is emitted by tsc, not by the loader these
 * tests run under.
 */
describe('POST …/task-templates/:id/instantiate — the body is checked as POST /tasks checks the same fields (found-30-sep/template-submit-ignores-the-form)', () => {
  const controller = readFileSync(join(__dirname, 'task-templates.controller.ts'), 'utf8')
  const route = controller.slice(controller.indexOf("@Post(':id/instantiate')"))
  const bodyType = /@Body\(\) body: (\w+),/.exec(route.slice(0, route.indexOf(') {')))?.[1] ?? null
  /** What the pipe refuses of a body: its class's rules, or nothing for an untyped one. */
  const refused = async (cls: (new () => object) | undefined, body: object) =>
    cls ? (await validate(plainToInstance(cls, body), { whitelist: true })).map((e) => e.property) : []
  const GOOD = {
    listId: 'l', title: 'x', titleOverride: 'x', priority: 'high', taskTypeId: '44444444-4444-4444-8444-444444444444',
    description: 'Typed', startDate: '2026-10-02T09:00:00.000Z', dueDate: '2026-10-03T17:00:00.000Z',
    timeEstimate: 5400, assigneeIds: [U1], labelIds: ['label-1'],
  }
  const BAD: Array<[string, unknown]> = [
    ['priority', 'super-urgent'],
    ['startDate', 'next week'],
    ['dueDate', '31/12/2026'],
    ['timeEstimate', 1.5],
    ['taskTypeId', 'not-an-id'],
    ['assigneeIds', U1],
    ['labelIds', [7]],
  ]

  it('takes a body holding every field the form can set, and refuses each value POST /tasks refuses, by the same field', async () => {
    const dtos: Record<string, new () => object> = await import('./dto/instantiate-template.dto').catch(() => ({}))
    const body = bodyType ? dtos[bodyType] : undefined
    assert.deepEqual(await refused(body, GOOD), [])
    assert.deepEqual(await refused(body, { listId: 'l' }), [])
    for (const [field, value] of BAD) {
      const sent = { ...GOOD, [field]: value }
      assert.deepEqual(await refused(body, sent), [field], `instantiate (body ${bodyType}) refuses ${field} ${JSON.stringify(value)}`)
      assert.deepEqual(await refused(CreateTaskDto, sent), [field], `POST /tasks refuses ${field} ${JSON.stringify(value)} too`)
    }
    // Below nothing, an estimate is no estimate here (POST /tasks takes one).
    assert.deepEqual(await refused(body, { ...GOOD, timeEstimate: -60 }), ['timeEstimate'])
  })

  /*
   * An estimate on `POST /tasks` is any whole number of seconds, one below nought
   * among them, where the template's route takes none below nought (the owner's
   * decision of 1 October on `found-30-sep/task-estimate-below-zero`). And
   * `found-30-sep/refused-create-leaves-tags` — tags by name, on both routes.
   */
  it('takes any whole estimate on POST /tasks, below nought among them, where the template’s route refuses one below nought, and takes tags by name on both', async () => {
    const dtos: Record<string, new () => object> = await import('./dto/instantiate-template.dto').catch(() => ({}))
    const body = bodyType ? dtos[bodyType] : undefined
    for (const timeEstimate of [-60, -1, 0, 5400]) {
      assert.deepEqual(await refused(CreateTaskDto, { ...GOOD, timeEstimate }), [], `POST /tasks takes ${timeEstimate}`)
    }
    for (const timeEstimate of [-60, -1]) {
      assert.deepEqual(await refused(body, { ...GOOD, timeEstimate }), ['timeEstimate'], `instantiate refuses ${timeEstimate}`)
    }
    const named = { ...GOOD, labelsByName: [{ name: 'Design', color: '#ff0000' }, { name: 'Later' }] }
    assert.deepEqual(await refused(CreateTaskDto, named), [])
    assert.deepEqual(await refused(body, named), [])
    for (const labelsByName of [[{ name: '' }], ['Design'], { name: 'Design' }]) {
      assert.deepEqual(await refused(CreateTaskDto, { ...GOOD, labelsByName }), ['labelsByName'], `POST /tasks refuses ${JSON.stringify(labelsByName)}`)
      assert.deepEqual(await refused(body, { ...GOOD, labelsByName }), ['labelsByName'], `instantiate refuses ${JSON.stringify(labelsByName)}`)
    }
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
