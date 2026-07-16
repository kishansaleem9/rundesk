import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  users,
  workspaceMembers,
  organizationMembers,
  tasks,
  taskAssignees,
  taskComments,
  timeEntries,
  oauthAccounts,
} from '@rundesk/db'
import { UsersService } from './users.service'

// §13.1 — the theme preference persists cross-device via PATCH /users/me, so the
// service validates it against the allowed set and writes it through.
describe('UsersService.updateProfile — theme persistence (§13.1)', () => {
  it('rejects an unsupported theme', async () => {
    const svc = new UsersService({} as any, {} as any)
    await assert.rejects(() => svc.updateProfile('u', { theme: 'neon' }), /Unsupported theme/)
  })

  it('accepts a valid theme, persists it, and strips the password hash', async () => {
    let captured: any = null
    const db = {
      update: () => ({
        set: (vals: any) => {
          captured = vals
          return {
            where: () => ({
              returning: async () => [
                { id: 'u', email: 'a@b.c', displayName: 'A', theme: vals.theme, passwordHash: 'secret' },
              ],
            }),
          }
        },
      }),
    } as any
    const svc = new UsersService(db, {} as any)
    const res = (await svc.updateProfile('u', { theme: 'dark' })) as any
    assert.equal(captured.theme, 'dark')
    assert.equal(res.theme, 'dark')
    assert.ok(!('passwordHash' in res))
  })
})

const SAMPLE_USER = {
  id: 'u1',
  email: 'ada@rundesk.dev',
  displayName: 'Ada',
  bio: 'hi',
  avatarUrl: 'https://x/a.png',
  role: 'member',
  passwordHash: 'secret-hash',
  isActive: true,
}

// A select() mock that resolves by the table passed to .from() — order-independent.
function identityDb(byTable: Map<any, any[]>) {
  return {
    select: () => {
      const chain: any = { _table: null }
      chain.from = (t: any) => {
        chain._table = t
        return chain
      }
      chain.innerJoin = () => chain
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.limit = () => chain
      chain.then = (resolve: any) => resolve(byTable.get(chain._table) ?? [])
      return chain
    },
  } as any
}

// §14.6 — data portability: the export bundles the caller's own data only.
describe('UsersService.exportUserData (GDPR export §14.6)', () => {
  it('returns a shaped bundle: profile (no hash), memberships, tasks, comments, time', async () => {
    const byTable = new Map<any, any[]>([
      [users, [SAMPLE_USER]],
      [workspaceMembers, [{ workspaceId: 'w1', name: 'Acme', slug: 'acme', role: 'member', joinedAt: new Date() }]],
      [organizationMembers, [{ organizationId: 'o1', name: 'Acme Inc', slug: 'acme', role: 'member', joinedAt: new Date() }]],
      [tasks, [{ id: 't1', title: 'Task', status: 'todo', createdAt: new Date() }]],
      [taskAssignees, [{ taskId: 't2', title: 'Assigned', assignedAt: new Date() }]],
      [taskComments, [{ id: 'c1', taskId: 't1', body: 'hello', createdAt: new Date() }]],
      [timeEntries, [{ id: 'te1', taskId: 't1', startedAt: new Date(), endedAt: null, durationSec: 60, description: null, isBillable: false }]],
      [oauthAccounts, [{ provider: 'google', connectedAt: new Date() }]],
    ])
    const svc = new UsersService(identityDb(byTable), {} as any)
    const bundle: any = await svc.exportUserData('u1')

    assert.equal(bundle.format, 'rundesk.gdpr.export.v1')
    assert.ok(bundle.exportedAt)
    // Profile present, secret stripped.
    assert.equal(bundle.profile.email, 'ada@rundesk.dev')
    assert.ok(!('passwordHash' in bundle.profile))
    // Sections present.
    assert.equal(bundle.memberships.workspaces.length, 1)
    assert.equal(bundle.memberships.organizations.length, 1)
    assert.equal(bundle.tasks.created.length, 1)
    assert.equal(bundle.tasks.assigned.length, 1)
    assert.equal(bundle.comments.length, 1)
    assert.equal(bundle.timeEntries.length, 1)
    assert.equal(bundle.connectedAccounts[0].provider, 'google')
    // Counts mirror section lengths.
    assert.equal(bundle.counts.comments, 1)
    assert.equal(bundle.counts.tasksAssigned, 1)
  })
})

// A FIFO select() mock for the deletion path (ordered queries) + tx capture.
function deletionDb(queue: any[][]) {
  let i = 0
  const captured = { updateSet: null as any, deletes: [] as any[] }
  const chain = () => {
    const c: any = {}
    c.from = () => c
    c.innerJoin = () => c
    c.where = () => c
    c.limit = () => c
    c.orderBy = () => c
    c.then = (resolve: any) => resolve(queue[i++] ?? [])
    return c
  }
  const tx: any = {
    delete: (t: any) => ({ where: async () => { captured.deletes.push(t); } }),
    update: () => ({ set: (vals: any) => { captured.updateSet = vals; return { where: async () => undefined } } }),
  }
  const db: any = {
    select: () => chain(),
    transaction: async (fn: any) => fn(tx),
  }
  return { db, captured }
}

// §14.6 — right to erasure: confirmation, anonymization, and orphan guards.
describe('UsersService.deleteAccount (GDPR erasure §14.6)', () => {
  it('rejects when the confirmation email does not match', async () => {
    const { db } = deletionDb([[SAMPLE_USER]])
    const svc = new UsersService(db, {} as any)
    await assert.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'wrong@x.com' }), /Type your account email/)
  })

  it('anonymizes PII, revokes sessions, and removes memberships', async () => {
    // findById -> user; role member so super-admin guard skipped; adminOf -> [].
    const { db, captured } = deletionDb([[SAMPLE_USER], []])
    const svc = new UsersService(db, {} as any)
    const res = await svc.deleteAccount('u1', { confirmEmail: 'ADA@rundesk.dev' }) // case-insensitive
    assert.deepEqual(res, { ok: true, anonymized: true, userId: 'u1' })

    // PII scrubbed on the users row.
    assert.match(captured.updateSet.email, /^deleted\+u1@/)
    assert.equal(captured.updateSet.displayName, 'Deleted User')
    assert.equal(captured.updateSet.passwordHash, null)
    assert.equal(captured.updateSet.avatarUrl, null)
    assert.equal(captured.updateSet.isActive, false)
    // Sessions, oauth, assignees, workspace + org memberships all deleted (5 tables).
    assert.equal(captured.deletes.length, 5)
  })

  it('blocks deleting the last admin of a workspace (no orphaning)', async () => {
    // findById -> user; adminOf -> one workspace; that workspace has a single admin.
    const { db } = deletionDb([[SAMPLE_USER], [{ workspaceId: 'w1', name: 'Acme' }], [{ c: 1 }]])
    const svc = new UsersService(db, {} as any)
    await assert.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'ada@rundesk.dev' }), /last admin of "Acme"/)
  })

  it('blocks deleting the last active super admin', async () => {
    const superUser = { ...SAMPLE_USER, role: 'super_admin' }
    // findById -> super user; super-admin count -> 1.
    const { db } = deletionDb([[superUser], [{ c: 1 }]])
    const svc = new UsersService(db, {} as any)
    await assert.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'ada@rundesk.dev' }), /last active super admin/)
  })
})
