import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
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
      // fireProjectEvent resolves workspaceId via the project's space.
      select: mock.fn(() => ({
        from: () => ({ where: () => ({ limit: async () => [{ workspaceId: 'w-1' }] }) }),
      })),
    } as any
    const webhooks = { fire: mock.fn(async () => undefined) } as any
    const slack = { notify: mock.fn(async () => undefined) } as any
    // §14.1 plan gate: no-op mock (enterprise allows everything).
    const plans = { assertCanCreateProjects: mock.fn(async () => undefined) } as any

    const svc = new ProjectsService(db, webhooks, slack, plans)
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

    const svc = new ProjectsService(db, webhooks, slack, {} as any) as any
    await svc.fireProjectEvent('project.updated', { id: 'p-9', name: 'Ghost', spaceId: 'missing' }, 'u-1')

    assert.equal(webhooks.fire.mock.callCount(), 0)
    assert.equal(slack.notify.mock.callCount(), 0)
  })
})
