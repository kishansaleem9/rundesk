import { BadRequestException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { TaskTemplatesService } from './task-templates.service'

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
