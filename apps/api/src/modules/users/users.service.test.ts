import assert from 'node:assert/strict'
import { after, before, describe, it, mock } from 'node:test'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import { hashSync } from 'bcryptjs'
import {
  users,
  sessions,
  workspaceMembers,
  organizationMembers,
  tasks,
  taskAssignees,
  taskComments,
  timeEntries,
  oauthAccounts,
} from '@rundesk/db'
import { UsersService } from './users.service'
import { passwords } from '../../common/security/password-hash'
import { hashRefreshToken } from '../../common/security/refresh-token'
import { WorkspaceSecuritySettingsService } from '../security/workspace-security-settings.service'

// §13.1 — the theme preference persists cross-device via PATCH /users/me, so the
// service validates it against the allowed set and writes it through.
describe('UsersService.updateProfile — theme persistence (§13.1)', () => {
  it('rejects an unsupported theme', async () => {
    const svc = new UsersService({} as any, {} as any, {} as any)
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
    const svc = new UsersService(db, {} as any, {} as any)
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
    const svc = new UsersService(identityDb(byTable), {} as any, {} as any)
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
    const svc = new UsersService(db, {} as any, {} as any)
    await assert.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'wrong@x.com' }), /Type your account email/)
  })

  it('anonymizes PII, revokes sessions, and removes memberships', async () => {
    // findById -> user; role member so super-admin guard skipped; adminOf -> [].
    const { db, captured } = deletionDb([[SAMPLE_USER], []])
    const svc = new UsersService(db, {} as any, {} as any)
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
    const svc = new UsersService(db, {} as any, {} as any)
    await assert.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'ada@rundesk.dev' }), /last admin of "Acme"/)
  })

  it('blocks deleting the last active super admin', async () => {
    const superUser = { ...SAMPLE_USER, role: 'super_admin' }
    // findById -> super user; super-admin count -> 1.
    const { db } = deletionDb([[superUser], [{ c: 1 }]])
    const svc = new UsersService(db, {} as any, {} as any)
    await assert.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'ada@rundesk.dev' }), /last active super admin/)
  })
})

const dialect = new PgDialect()
const rendered = (fragment: unknown) => dialect.sqlToQuery(fragment as never)

/*
 * ONE EMAIL, IN ANY CASE (`found-30-sep/sign-in-reads-the-email-as-typed`).
 * Sign-in, sign-up's check that the email is free, forgot-password and the
 * verification resend read the account through `findByEmail`; an account made
 * in lower case was refused when its email was typed with a capital.
 */
describe('UsersService.findByEmail — one email, in any case', () => {
  it('findByEmail finds the account in any case: lower(email) = lower(what was typed), the one stored as typed first, then the older', async () => {
    const seen: { where?: unknown; orderBy?: unknown[]; limit?: number } = {}
    const chain: any = {
      from: () => chain,
      where: (condition: unknown) => {
        seen.where = condition
        return chain
      },
      orderBy: (...order: unknown[]) => {
        seen.orderBy = order
        return chain
      },
      limit: (n: number) => {
        seen.limit = n
        return Promise.resolve([SAMPLE_USER])
      },
    }
    const svc = new UsersService({ select: () => chain } as any, {} as any, {} as any)
    assert.equal((await svc.findByEmail(' Ada@Rundesk.dev'))?.id, 'u1')
    const where = rendered(seen.where)
    assert.equal(where.sql, 'lower("users"."email") = lower($1)', 'the email is compared as stored')
    assert.deepEqual(where.params, ['Ada@Rundesk.dev'])
    assert.deepEqual((seen.orderBy ?? []).map((order) => rendered(order).sql), ['("users"."email" = $1) desc', '"users"."created_at" asc'])
    assert.equal(seen.limit, 1)
  })
})

/*
 * CHANGING ONE'S PASSWORD (`found-30-sep/password-change-unthrottled`): held to
 * the workspace's password policy, as reset-password is, and signing out every
 * session of the account but the caller's, in the transaction that writes the
 * password. The limit on the route is `auth-route-limits.test.ts`'s; a lane
 * measures all three in `sign-in-and-password.mjs`.
 */
describe('UsersService.changePassword — held to the workspace’s policy, and signing out every other session', () => {
  const CURRENT = 'Current@12345!'
  const stored = hashSync(CURRENT, 4)
  let restoreHash = () => undefined as void
  before(() => {
    // The new hash is the hasher's business (`password-hash.test.ts`); a cost-12 one per test is time for nothing.
    const hashed = mock.method(passwords, 'hash', async () => 'NEW-HASH')
    restoreHash = () => hashed.mock.restore()
  })
  after(() => restoreHash())

  /** Answers the account; records every UPDATE the transaction makes, on which table. */
  function changeDb() {
    const writes: Array<{ table: unknown; set: any; where: unknown }> = []
    const tx = {
      update: (table: unknown) => ({
        set: (set: any) => ({
          where: (where: unknown) => {
            writes.push({ table, set, where })
            const done: any = Promise.resolve(undefined)
            done.returning = async () => (table === sessions ? [{ id: 's2' }, { id: 's3' }] : [])
            return done
          },
        }),
      }),
    }
    const db = {
      select: () => ({ from: () => ({ where: async () => [{ ...SAMPLE_USER, passwordHash: stored }] }) }),
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    }
    return { db: db as any, writes }
  }
  /** The real policy code, with the workspace's settings and the breach list answered here. */
  function workspacePolicy(requireStrongPasswords: boolean, blockBreachedPasswords = false, breached = false) {
    const settings = new WorkspaceSecuritySettingsService({} as any, {} as any)
    settings.getEffectiveForUser = async () => ({ settings: { requireStrongPasswords, blockBreachedPasswords } as any, isWorkspaceAdmin: false })
    settings.isPasswordBreached = async () => breached
    return settings
  }

  it('a wrong current password is refused 401, and nothing is written', async () => {
    const { db, writes } = changeDb()
    const svc = new UsersService(db, {} as any, workspacePolicy(true))
    await assert.rejects(() => svc.changePassword('u1', 'Guess@12345!', 'Another@12345!', 'RAW-REFRESH'), (err: unknown) => err instanceof UnauthorizedException)
    assert.deepEqual(writes, [])
  })

  it('the new password is held to the workspace’s password policy: a weak one is refused 400 saying what it lacks, and nothing is written', async () => {
    const { db, writes } = changeDb()
    const svc = new UsersService(db, {} as any, workspacePolicy(true))
    await assert.rejects(
      () => svc.changePassword('u1', CURRENT, 'password1', 'RAW-REFRESH'),
      (err: unknown) => err instanceof BadRequestException && /at least 10 characters.*an uppercase letter.*a symbol/.test(err.message),
    )
    assert.deepEqual(writes, [])
  })

  it('it is the workspace’s policy: with strong passwords not required there, eight characters will do, and seven never', async () => {
    const { db, writes } = changeDb()
    const svc = new UsersService(db, {} as any, workspacePolicy(false))
    await assert.rejects(() => svc.changePassword('u1', CURRENT, 'passwd1', null), /at least 8 characters/)
    assert.deepEqual(await svc.changePassword('u1', CURRENT, 'password1', null), { ok: true, revoked: 2 })
    assert.equal(writes.find((w) => w.table === users)?.set.passwordHash, 'NEW-HASH')
  })

  it('a password on the breach list is refused where the workspace blocks them', async () => {
    const { db, writes } = changeDb()
    const svc = new UsersService(db, {} as any, workspacePolicy(true, true, true))
    await assert.rejects(() => svc.changePassword('u1', CURRENT, 'Breached@12345!', null), /known data breach/)
    assert.deepEqual(writes, [])
  })

  it('a change revokes every other session of the account in the transaction that writes the password, and keeps the one the caller’s refresh token names, hashed or as stored before hashing', async () => {
    const { db, writes } = changeDb()
    const svc = new UsersService(db, {} as any, workspacePolicy(true))
    assert.deepEqual(await svc.changePassword('u1', CURRENT, 'Another@12345!', 'RAW-REFRESH'), { ok: true, revoked: 2 })
    assert.deepEqual(writes.map((w) => w.table), [users, sessions], 'the password, then the sessions, in one transaction')
    assert.deepEqual(writes[1].set, { isRevoked: true })
    const where = rendered(writes[1].where)
    assert.equal(
      where.sql,
      '("sessions"."user_id" = $1 and "sessions"."is_revoked" = $2 and "sessions"."refresh_token" <> $3 and "sessions"."refresh_token" <> $4)',
    )
    assert.deepEqual(where.params, ['u1', false, hashRefreshToken('RAW-REFRESH'), 'RAW-REFRESH'])
  })

  it('a caller that names no session keeps none: every live session of the account is revoked, as after a reset', async () => {
    const { db, writes } = changeDb()
    const svc = new UsersService(db, {} as any, workspacePolicy(true))
    await svc.changePassword('u1', CURRENT, 'Another@12345!', null)
    const where = rendered(writes[1].where)
    assert.equal(where.sql, '("sessions"."user_id" = $1 and "sessions"."is_revoked" = $2)')
    assert.deepEqual(where.params, ['u1', false])
  })
})
