import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ClientPortalService, toClientTask, humanizeStatusKey } from './client-portal.service'
import { clientPortals, projects, workspaceMembers, tasks, clients } from '@rundesk/db'

/**
 * A scripted, chainable Drizzle-shaped fake. Terminal awaits resolve via the
 * `handler`, which dispatches on the operation + anchor table. Intermediate
 * builder methods just return the same chain. `.values()` is captured so an
 * insert's `.returning()` can echo the row the service built (incl. its
 * generated token).
 */
type QueryState = { op: string; table?: unknown; values?: Record<string, unknown> }
type Handler = (state: QueryState) => unknown

function makeDb(handler: Handler) {
  function chain(op: string, table?: unknown) {
    const state: QueryState = { op, table }
    const c: any = {
      from: (t: unknown) => { state.table = t; return c },
      innerJoin: () => c,
      leftJoin: () => c,
      where: () => c,
      limit: () => c,
      orderBy: () => c,
      set: () => c,
      values: (v: Record<string, unknown>) => { state.values = v; return c },
      onConflictDoNothing: () => c,
      returning: () => c,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve().then(() => handler(state)).then(resolve, reject),
    }
    return c
  }
  return {
    select: () => chain('select'),
    insert: (t: unknown) => chain('insert', t),
    update: (t: unknown) => chain('update', t),
    delete: (t: unknown) => chain('delete', t),
  } as any
}

const PROJECT_ROW = {
  projectId: 'proj-1',
  projectName: 'Website Redesign',
  projectVisibility: null,
  spaceId: 'space-1',
  spaceVisibility: 'public',
  workspaceId: 'ws-1',
}

const META_ROW = {
  projectName: 'Website Redesign',
  workspaceName: 'Aura Agency',
  workspaceLogoUrl: 'https://cdn/logo.png',
  workspacePrimaryColor: '#354fb0',
  workspaceAccentColor: '#ff8800',
  clientName: 'Acme Co',
}

// Task rows deliberately carry INTERNAL fields to prove the projection strips
// them. Only the client-safe columns must survive into the response.
const OPEN_TASK = {
  id: 'task-open',
  title: 'Design homepage',
  status: 'in_progress',
  statusCategory: 'in_progress',
  statusLabel: 'In progress',
  statusColor: '#3b82f6',
  dueDate: new Date('2026-08-01T00:00:00Z'),
  completedAt: null,
  isMilestone: true,
  // internal — must never leak:
  assigneeEmail: 'internal@aura.agency',
  description: 'INTERNAL private notes',
  priority: 'urgent',
  createdById: 'user-internal',
  listId: 'list-secret',
}
const DONE_TASK = {
  id: 'task-done',
  title: 'Kickoff call',
  status: 'done',
  statusCategory: 'closed',
  statusLabel: 'Done',
  statusColor: '#22c55e',
  dueDate: null,
  completedAt: new Date('2026-07-01T00:00:00Z'),
  isMilestone: false,
  assigneeEmail: 'internal@aura.agency',
  description: 'INTERNAL',
  priority: 'high',
  createdById: 'user-internal',
  listId: 'list-secret',
}

const SAFE_TASK_KEYS = ['id', 'title', 'status', 'statusCategory', 'statusColor', 'dueDate', 'isMilestone'].sort()

describe('ClientPortalService — safe projection (pure)', () => {
  it('toClientTask emits ONLY client-safe keys, dropping internal fields', () => {
    const out = toClientTask(OPEN_TASK as any)
    assert.deepEqual(Object.keys(out).sort(), SAFE_TASK_KEYS)
    // Positively assert none of the internal fields survived.
    for (const leak of ['assigneeEmail', 'description', 'priority', 'createdById', 'listId', 'completedAt']) {
      assert.equal((out as any)[leak], undefined, `internal field "${leak}" must not leak`)
    }
    assert.equal(out.status, 'In progress')
    assert.equal(out.dueDate, '2026-08-01T00:00:00.000Z')
  })

  it('toClientTask falls back to a humanised status key when no label resolves', () => {
    const out = toClientTask({ ...OPEN_TASK, statusLabel: null } as any)
    assert.equal(out.status, 'In progress')
  })

  it('humanizeStatusKey normalises snake/kebab keys', () => {
    assert.equal(humanizeStatusKey('in_progress'), 'In progress')
    assert.equal(humanizeStatusKey('to-do'), 'To do')
    assert.equal(humanizeStatusKey(''), 'Status')
  })
})

describe('ClientPortalService.create', () => {
  it('returns a fresh ~24-char token and its public url', async () => {
    const db = makeDb((s) => {
      if (s.op === 'select' && s.table === projects) return [PROJECT_ROW]
      if (s.op === 'select' && s.table === workspaceMembers) return [{ role: 'workspace_admin' }]
      if (s.op === 'insert' && s.table === clientPortals) {
        // Echo the inserted row, filling the DB-side default for is_enabled.
        return [{ id: 'portal-1', createdAt: new Date(), lastViewedAt: null, isEnabled: true, ...s.values }]
      }
      return []
    })
    const svc = new ClientPortalService(db)
    const out = await svc.create('proj-1', 'user-1', { name: 'Client view' })
    assert.match(out.token, /^[A-Za-z0-9_-]{24}$/, 'token is 24-char base64url')
    assert.equal(out.url, `/portal/${out.token}`)
    assert.equal(out.name, 'Client view')
    assert.equal(out.projectId, 'proj-1')
    assert.equal(out.isEnabled, true)
  })
})

describe('ClientPortalService.getPublicView', () => {
  function dbFor(portal: Record<string, unknown>, taskRows: unknown[]) {
    return makeDb((s) => {
      if (s.op === 'select' && s.table === clientPortals) return [portal]
      if (s.op === 'select' && s.table === projects) return [META_ROW]
      if (s.op === 'select' && s.table === clients) return [{ name: META_ROW.clientName }]
      if (s.op === 'select' && s.table === tasks) return taskRows
      return []
    })
  }
  const basePortal = {
    id: 'portal-1',
    token: 'tok',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    clientId: 'client-1',
    name: null,
    isEnabled: true,
    showCompleted: true,
    createdById: 'user-1',
    createdAt: new Date(),
    lastViewedAt: null,
  }

  it('returns branding + the project tasks with ONLY safe fields', async () => {
    const svc = new ClientPortalService(dbFor(basePortal, [OPEN_TASK, DONE_TASK]))
    const view = await svc.getPublicView('tok')

    assert.equal(view.workspace.name, 'Aura Agency')
    assert.equal(view.workspace.logoUrl, 'https://cdn/logo.png')
    assert.equal(view.workspace.primaryColor, '#354fb0')
    assert.equal(view.project.name, 'Website Redesign')
    assert.equal(view.client?.name, 'Acme Co')
    assert.equal(view.progress.total, 2)
    assert.equal(view.progress.completed, 1)
    assert.equal(view.progress.percent, 50)

    // Every task exposes exactly the safe key-set — no internal fields.
    for (const task of view.tasks) {
      assert.deepEqual(Object.keys(task).sort(), SAFE_TASK_KEYS)
    }
    const serialized = JSON.stringify(view)
    assert.equal(serialized.includes('internal@aura.agency'), false, 'no assignee email leaks')
    assert.equal(serialized.includes('INTERNAL'), false, 'no internal notes leak')
    assert.equal(serialized.includes('urgent'), false, 'no priority leaks')
  })

  it('hides completed tasks when show_completed is false (progress stays accurate)', async () => {
    const portal = { ...basePortal, showCompleted: false }
    const svc = new ClientPortalService(dbFor(portal, [OPEN_TASK, DONE_TASK]))
    const view = await svc.getPublicView('tok')
    assert.equal(view.tasks.length, 1)
    assert.equal(view.tasks[0].id, 'task-open')
    // Progress still counts the hidden completed task.
    assert.equal(view.progress.total, 2)
    assert.equal(view.progress.completed, 1)
    assert.equal(view.showCompleted, false)
  })

  it('includes completed tasks when show_completed is true', async () => {
    const svc = new ClientPortalService(dbFor(basePortal, [OPEN_TASK, DONE_TASK]))
    const view = await svc.getPublicView('tok')
    assert.equal(view.tasks.length, 2)
  })

  it('404s a disabled portal (opaque — same as missing)', async () => {
    const portal = { ...basePortal, isEnabled: false }
    const svc = new ClientPortalService(dbFor(portal, []))
    await assert.rejects(() => svc.getPublicView('tok'), /Portal not found/)
  })

  it('404s an unknown token without touching project/task data', async () => {
    const svc = new ClientPortalService(makeDb(() => []))
    await assert.rejects(() => svc.getPublicView('nope'), /Portal not found/)
  })

  it('uses the portal display name over the project name when set', async () => {
    const portal = { ...basePortal, name: 'Acme Project Hub' }
    const svc = new ClientPortalService(dbFor(portal, []))
    const view = await svc.getPublicView('tok')
    assert.equal(view.portal.name, 'Acme Project Hub')
    assert.equal(view.project.name, 'Website Redesign')
  })
})
