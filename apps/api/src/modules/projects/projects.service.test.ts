import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import { ProjectsService } from './projects.service'

/**
 * Locks in the §12.4 webhook + §12.1 Slack fan-out for project lifecycle
 * events. The audit found `project.created` / `project.updated` were
 * advertised in WEBHOOK_EVENTS but never dispatched; these tests guard that
 * the source-of-truth mutations now fire them, with the workspace resolved
 * off the project's space and delivery routed best-effort.
 */

function flush() {
  // Let the non-blocking `void this.fireProjectEvent(...)` chain settle.
  return new Promise((resolve) => setTimeout(resolve, 20))
}

describe('ProjectsService project event firing', () => {
  it('createProject fires project.created + Slack with a workspace-resolved payload', async () => {
    const project = { id: 'p-1', name: 'Apollo', spaceId: 's-1' }
    const db = {
      insert: mock.fn(() => ({
        values: mock.fn(() => ({
          returning: async () => [project],
          onConflictDoNothing: async () => undefined,
        })),
      })),
      /*
       * ONE ROW THAT ANSWERS EVERY READ ON THIS PATH, and it has to carry more
       * than the workspace id now. `fireProjectEvent` resolves `workspaceId`
       * via the project's space — that is what this row was for — and since
       * §V2-06 `createProject` also consults the space's Default permission
       * before writing, which reads `workspace_members.role` first.
       *
       * `role: 'workspace_admin'` is not decoration: it is in
       * `WS_UNRESTRICTED`, so `resolveSpaceLevel` returns `admin` from the
       * workspace role and stops. Without it the blanket mock answers the
       * membership lookup with a row whose `role` is undefined, the resolver
       * falls through to the space's own `default_permission` — also undefined
       * here — and the service correctly refuses to create anything. The test
       * then fails on a permission error while being about event firing.
       *
       * `default_permission` is `notNull().default('edit')` in the schema, so
       * that undefined is a property of this mock and not something production
       * can produce.
       */
      select: mock.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ workspaceId: 'w-1', role: 'workspace_admin' }],
          }),
        }),
      })),
    } as any
    const webhooks = { fire: mock.fn(async () => undefined) } as any
    const slack = { notify: mock.fn(async () => undefined) } as any
    // §14.1 plan gate: no-op mock (enterprise allows everything).
    const plans = { assertCanCreateProjects: mock.fn(async () => undefined) } as any

    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new ProjectsService(db, webhooks, slack, plans, security)
    const out = await svc.createProject('s-1', { name: 'Apollo' }, 'u-1')
    assert.equal(out.id, 'p-1')

    await flush()

    assert.equal(webhooks.fire.mock.callCount(), 1, 'project.created webhook fired')
    const [wsId, event, payload] = webhooks.fire.mock.calls[0].arguments
    assert.equal(wsId, 'w-1')
    assert.equal(event, 'project.created')
    assert.deepEqual(payload.project, { id: 'p-1', name: 'Apollo', spaceId: 's-1', workspaceId: 'w-1' })
    assert.equal(payload.actorId, 'u-1')

    assert.equal(slack.notify.mock.callCount(), 1, 'Slack project alert routed')
    const [sWsId, sEvent, , sOpts] = slack.notify.mock.calls[0].arguments
    assert.equal(sWsId, 'w-1')
    assert.equal(sEvent, 'project.created')
    assert.equal(sOpts.projectId, 'p-1', 'routed with project scope for per-channel rules')
  })

  it('fireProjectEvent is a no-op when the space (workspace) cannot be resolved', async () => {
    const db = {
      select: mock.fn(() => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      })),
    } as any
    const webhooks = { fire: mock.fn(async () => undefined) } as any
    const slack = { notify: mock.fn(async () => undefined) } as any

    const svc = new ProjectsService(db, webhooks, slack, {} as any, {} as any) as any
    await svc.fireProjectEvent('project.updated', { id: 'p-9', name: 'Ghost', spaceId: 'missing' }, 'u-1')

    assert.equal(webhooks.fire.mock.callCount(), 0)
    assert.equal(slack.notify.mock.callCount(), 0)
  })
})

describe('ProjectsService.deleteProject — §13.3 audit event', () => {
  it('archives and logs project.deleted with the actor + IP', async () => {
    // update(projects).set(...).where(...) — a chainable thenable stub.
    const chain = () => {
      const q = Promise.resolve([]) as any
      q.set = () => q
      q.where = () => q
      return q
    }
    const db = { update: mock.fn(() => chain()) } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new ProjectsService(db, {} as any, {} as any, {} as any, security) as any
    // Manage-check is exercised elsewhere; here we assert the audit wiring.
    svc.assertManageable = mock.fn(async () => ({ workspaceId: 'w1', name: 'Apollo', createdById: 'u1' }))

    await svc.deleteProject('p1', 'actor-1', '198.51.100.4')

    assert.equal(db.update.mock.callCount(), 1, 'the project is archived')
    assert.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written')
    const e = security.logAuditEvent.mock.calls[0].arguments[0]
    assert.equal(e.action, 'project.deleted')
    assert.equal(e.resourceType, 'project')
    assert.equal(e.resourceId, 'p1')
    assert.equal(e.workspaceId, 'w1')
    assert.equal(e.actorId, 'actor-1')
    assert.equal(e.ipAddress, '198.51.100.4')
  })
})

/**
 * A PROJECT'S TIME IS BILLED ONLY TO A CLIENT OF ITS OWN WORKSPACE. `PUT
 * /projects/:id` copied `clientId` into the row and only the foreign key looked
 * at it, so another workspace's client could be set; the time report then printed
 * that workspace's client name. The lookup is rendered, so a check that asks for
 * the client by id alone does not pass for one that asks for it in this workspace.
 */
describe('ProjectsService.updateProject — a client of the project\'s own workspace', () => {
  const dialect = new PgDialect()
  const CLIENT = '11111111-1111-4111-8111-111111111111'
  const setUp = (clientRows: unknown[]) => {
    const wheres: unknown[] = []
    const sets: Record<string, unknown>[] = []
    const db = {
      select: mock.fn(() => ({
        from: () => ({
          where: (w: unknown) => {
            wheres.push(w)
            return { limit: async () => clientRows }
          },
        }),
      })),
      update: mock.fn(() => ({
        set: (s: Record<string, unknown>) => {
          sets.push(s)
          return { where: () => ({ returning: async () => [] }) }
        },
      })),
    } as any
    const svc = new ProjectsService(db, {} as any, {} as any, {} as any, {} as any) as any
    svc.assertManageable = mock.fn(async () => ({ workspaceId: 'w-own', name: 'Apollo', createdById: 'u-1' }))
    return { svc, db, wheres, sets }
  }

  it('refuses a client that is not one of the project\'s workspace\'s clients (400), and writes nothing', async () => {
    const { svc, db } = setUp([])
    await assert.rejects(
      () => svc.updateProject('p-1', { clientId: CLIENT }, 'u-1'),
      (err: any) => err instanceof BadRequestException,
    )
    assert.equal(db.update.mock.callCount(), 0, 'the project was not changed')
  })

  it('looks the client up among the project\'s workspace\'s clients only, then sets it', async () => {
    const { svc, db, wheres, sets } = setUp([{ id: CLIENT }])
    await svc.updateProject('p-1', { clientId: CLIENT }, 'u-1')
    assert.equal(wheres.length, 1, 'one lookup of the client')
    const params = dialect.sqlToQuery(wheres[0] as never).params
    assert.ok(params.includes(CLIENT), 'asks for the client by its id')
    assert.ok(params.includes('w-own'), 'and in the project\'s own workspace')
    assert.equal(db.update.mock.callCount(), 1)
    assert.equal(sets[0].clientId, CLIENT)
  })

  it('refuses a clientId that is not an id (400) without asking the database', async () => {
    const { svc, db } = setUp([{ id: CLIENT }])
    await assert.rejects(
      () => svc.updateProject('p-1', { clientId: 'not-an-id' }, 'u-1'),
      (err: any) => err instanceof BadRequestException,
    )
    assert.equal(db.select.mock.callCount(), 0)
    assert.equal(db.update.mock.callCount(), 0)
  })

  it('clears the client (null) without a lookup', async () => {
    const { svc, db, sets } = setUp([])
    await svc.updateProject('p-1', { clientId: null }, 'u-1')
    assert.equal(db.select.mock.callCount(), 0)
    assert.equal(sets[0].clientId, null)
  })
})

describe('ProjectsService — a project\'s folder is one of its own space\'s (found-28-sep/project-folder-unchecked-across-workspaces)', () => {
  const FOLDER = '22222222-2222-4222-8222-222222222222'
  /** Select answers in order: the project's space, then the folder. */
  const setUp = (answers: unknown[][]) => {
    const sets: Record<string, unknown>[] = []
    const queue = [...answers]
    const db = {
      select: mock.fn(() => ({ from: () => ({ where: () => ({ limit: async () => queue.shift() ?? [] }) }) })),
      update: mock.fn(() => ({
        set: (s: Record<string, unknown>) => {
          sets.push(s)
          return { where: () => ({ returning: async () => [] }) }
        },
      })),
    } as any
    const svc = new ProjectsService(db, {} as any, {} as any, {} as any, {} as any) as any
    svc.assertManageable = mock.fn(async () => ({ workspaceId: 'w-own', name: 'Apollo', createdById: 'u-1' }))
    return { svc, db, sets }
  }

  it('refuses a folder of another space — or another workspace — (400), and writes nothing', async () => {
    const { svc, db } = setUp([[{ spaceId: 's-own' }], [{ spaceId: 's-elsewhere', isArchived: false }]])
    await assert.rejects(() => svc.updateProject('p-1', { folderId: FOLDER }, 'u-1'), (err: any) => err instanceof BadRequestException)
    assert.equal(db.update.mock.callCount(), 0, 'the project was not changed')
  })

  it('refuses a deleted folder of its own space (400)', async () => {
    const { svc, db } = setUp([[{ spaceId: 's-own' }], [{ spaceId: 's-own', isArchived: true }]])
    await assert.rejects(() => svc.updateProject('p-1', { folderId: FOLDER }, 'u-1'), (err: any) => err instanceof BadRequestException)
    assert.equal(db.update.mock.callCount(), 0)
  })

  it('sets a folder of its own space', async () => {
    const { svc, sets } = setUp([[{ spaceId: 's-own' }], [{ spaceId: 's-own', isArchived: false }]])
    await svc.updateProject('p-1', { folderId: FOLDER }, 'u-1')
    assert.equal(sets[0].folderId, FOLDER)
  })

  it('takes a project out of its folder (null) without a lookup', async () => {
    const { svc, db, sets } = setUp([])
    await svc.updateProject('p-1', { folderId: null }, 'u-1')
    assert.equal(db.select.mock.callCount(), 0)
    assert.equal(sets[0].folderId, null)
  })
})
