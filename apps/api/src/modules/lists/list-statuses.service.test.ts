import { BadRequestException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ListStatusesService } from './list-statuses.service'

/**
 * Build a Drizzle-shaped mock with stage-by-stage chain support. Each stage
 * returns the next chain segment; resolve points return scripted fixtures.
 * Keeping it minimal lets the tests describe behaviour without re-creating
 * the full ORM surface.
 */
function buildDb(opts: {
  // Returned by .select().from(listStatuses).where(...).orderBy(...)
  statusesByList?: any[]
  // Returned by .select(...).from(tasks).where(...) — used by remove()
  taskCountByStatus?: number
  // Returned by .select({id}).from(lists).where(...).limit(1)
  listExists?: boolean
  // Returned by insert(...).values(...).returning()
  insertReturning?: any[]
  // Returned by update(...).set(...).where(...).returning()
  updateReturning?: any[]
} = {}) {
  // Dispatch from(table) by detecting which select shape was used; the
  // chain resolver treats each .from() call as its own pipeline.
  const fromHandler = () => {
    return {
      where: mock.fn(() => ({
        // limit() -> used by requireById / assertListExists / getByKey
        limit: mock.fn(async () => {
          if (opts.listExists === false) return []
          return opts.statusesByList ?? []
        }),
        // orderBy() -> used by list()
        orderBy: mock.fn(async () => opts.statusesByList ?? []),
      })),
    }
  }

  return {
    select: mock.fn((shape?: any) => {
      // Detect the count(*) call shape used by remove()
      const isCount = shape && Object.values(shape ?? {}).some((v) => {
        return typeof v === 'object' && v !== null && 'queryChunks' in (v as any)
      })
      if (isCount) {
        return {
          from: mock.fn(() => ({
            where: mock.fn(async () => [{ count: opts.taskCountByStatus ?? 0 }]),
          })),
        }
      }
      // assertListExists detection: shape with `id`
      if (shape && typeof shape === 'object' && 'id' in shape && Object.keys(shape).length === 1) {
        return {
          from: mock.fn(() => ({
            where: mock.fn(() => ({
              limit: mock.fn(async () => (opts.listExists === false ? [] : [{ id: 'list-1' }])),
            })),
          })),
        }
      }
      // nextPosition detection: shape with `maxPos`
      if (shape && typeof shape === 'object' && 'maxPos' in shape) {
        return {
          from: mock.fn(() => ({
            where: mock.fn(async () => [{ maxPos: -1 }]),
          })),
        }
      }
      return { from: fromHandler }
    }),
    insert: mock.fn(() => ({
      values: mock.fn(() => ({
        returning: mock.fn(async () => opts.insertReturning ?? [{ id: 'st-1' }]),
        onConflictDoNothing: mock.fn(async () => undefined),
      })),
    })),
    update: mock.fn(() => ({
      set: mock.fn(() => ({
        where: mock.fn(() => ({
          returning: mock.fn(async () => opts.updateReturning ?? [{ id: 'st-1', name: 'Renamed' }]),
        })),
      })),
    })),
    delete: mock.fn(() => ({
      where: mock.fn(async () => undefined),
    })),
  } as any
}

describe('ListStatusesService', () => {
  it('create() rejects empty name', async () => {
    const svc = new ListStatusesService(buildDb({ listExists: true }))
    await assert.rejects(
      () => svc.create('list-1', { name: '   ' }),
      (e: unknown) => e instanceof BadRequestException,
    )
  })

  it('create() rejects unknown category', async () => {
    const svc = new ListStatusesService(buildDb({ listExists: true }))
    await assert.rejects(
      () => svc.create('list-1', { name: 'Triaged', category: 'bogus' as any }),
      (e: unknown) => e instanceof BadRequestException,
    )
  })

  it('create() throws NotFound when list does not exist', async () => {
    const svc = new ListStatusesService(buildDb({ listExists: false }))
    await assert.rejects(
      () => svc.create('list-missing', { name: 'Triaged' }),
      (e: unknown) => e instanceof NotFoundException,
    )
  })

  it('update() rejects empty name patch', async () => {
    const svc = new ListStatusesService(
      buildDb({ statusesByList: [{ id: 'st-1', listId: 'list-1', key: 'todo', category: 'open' }] }),
    )
    await assert.rejects(
      () => svc.update('list-1', 'st-1', { name: '   ' }),
      (e: unknown) => e instanceof BadRequestException,
    )
  })

  it('remove() refuses when tasks still reference the status and no reassign target is provided', async () => {
    const svc = new ListStatusesService(
      buildDb({
        statusesByList: [{ id: 'st-1', listId: 'list-1', key: 'todo', category: 'open' }],
        taskCountByStatus: 3,
      }),
    )
    await assert.rejects(
      () => svc.remove('list-1', 'st-1', null),
      (e: unknown) =>
        e instanceof BadRequestException &&
        /still use it/.test((e as BadRequestException).message),
    )
  })

  it('list() returns rows ordered by position', async () => {
    const fixtures = [
      { id: 'st-1', key: 'todo', position: 1 },
      { id: 'st-0', key: 'backlog', position: 0 },
    ]
    // Service relies on the DB to apply orderBy; we simulate by returning the
    // sorted fixture from the chain resolver.
    const sorted = [...fixtures].sort((a, b) => a.position - b.position)
    const svc = new ListStatusesService(buildDb({ statusesByList: sorted }))
    const out = await svc.list('list-1')
    assert.equal(out[0].key, 'backlog')
    assert.equal(out[1].key, 'todo')
  })
})
