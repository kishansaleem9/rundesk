import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FeatureFlagsService } from './feature-flags.service'

// thenable Drizzle chain that resolves to the given rows
const chain = (rows: any[]): any => ({
  from: () => chain(rows),
  where: () => chain(rows),
  limit: () => chain(rows),
  then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
  // A drizzle builder is a QueryPromise, so `.catch(...)` is a shape the
  // service genuinely uses — `insert(...).values(...).catch(...)` here.
  catch: (rej: (e: any) => any) => Promise.resolve(rows).catch(rej),
})

/**
 * A db whose selects answer in order. requestFlag runs three of them —
 * membership, flag overrides, a recent ask — and each needs a different
 * answer, which one fixed row set cannot give. Who is told comes from
 * `CustomRolesService.holdersOf` (`rolesHolding`).
 *
 * Inserts are recorded rather than ignored: the ask itself is now written down
 * (0113), which is what the once-a-day rule reads, so a fake that swallowed it
 * would let a test pass while the record that rule depends on never happened.
 */
const dbWithSelects = (queue: any[][]) => {
  let i = 0
  const inserted: any[] = []
  const db = {
    select: () => chain(queue[i++] ?? []),
    insert: () => ({ values: (v: any) => (inserted.push(v), chain([])) }),
    inserted,
  }
  return db as any
}

/**
 * `workspace.clickapps.manage` — who holds it, as `CustomRolesService` answers:
 * `hasPermission` for the switch, `holdersOf` for the ask.
 */
const rolesHolding = (holders: string[]) => ({
  hasPermission: async (_ws: string, userId: string, key: string) => key === 'workspace.clickapps.manage' && holders.includes(userId),
  holdersOf: async (_ws: string, key: string) => (key === 'workspace.clickapps.manage' ? holders : []),
})

/**
 * A db that records the override it is asked to write. A switch runs in a
 * transaction: it updates the switch's own row, found with NULLs equal, and
 * writes one when there is none — here there never is.
 */
const writingDb = () => {
  const written: any[] = []
  const tx = {
    execute: async () => undefined,
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    insert: () => ({ values: async (v: any) => { written.push(v) } }),
  }
  return {
    written,
    insert: tx.insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  }
}

describe('FeatureFlagsService.setFlag authorization', () => {
  it('rejects a non-super-admin setting a global flag', async () => {
    const svc = new FeatureFlagsService({} as any, {} as any, {} as any, rolesHolding([]) as any)
    await assert.rejects(
      () => svc.setFlag('goals' as any, true, 'global', null, null, { id: 'u', role: 'member' }),
      /super admin/i,
    )
  })

  it('rejects a workspace flag from somebody who does not hold workspace.clickapps.manage', async () => {
    const db = writingDb()
    const svc = new FeatureFlagsService(db as any, {} as any, {} as any, rolesHolding(['someone-else']) as any)
    await assert.rejects(
      () => svc.setFlag('goals' as any, false, 'workspace', 'ws1', 'ws1', { id: 'u', role: 'member' }),
      /Missing required permission: workspace\.clickapps\.manage/,
    )
    assert.equal(db.written.length, 0, 'a refused switch wrote an override')
  })

  it('lets a holder of workspace.clickapps.manage switch a flag for their workspace, whatever their base role', async () => {
    const db = writingDb()
    const security = { logAuditEvent: async () => undefined }
    const svc = new FeatureFlagsService(db as any, security as any, {} as any, rolesHolding(['u']) as any)
    await svc.setFlag('goals' as any, false, 'workspace', null, 'ws1', { id: 'u', role: 'member' })
    assert.deepEqual(
      db.written.map((r) => [r.flagKey, r.scope, r.scopeId, r.workspaceId, r.enabled]),
      [['goals', 'workspace', 'ws1', 'ws1', false]],
      'a workspace override is stored under its own workspace, so `resolveFromDb` applies it',
    )
  })

  it('refuses a workspace override whose scopeId names another workspace (it would never apply)', async () => {
    const db = writingDb()
    const svc = new FeatureFlagsService(db as any, {} as any, {} as any, rolesHolding(['u']) as any)
    await assert.rejects(
      () => svc.setFlag('goals' as any, false, 'workspace', 'ws2', 'ws1', { id: 'u', role: 'member' }),
      /scopeId must be the workspaceId/,
    )
    assert.equal(db.written.length, 0)
  })

  it('refuses a flag that does not exist (400), as the ask does', async () => {
    const db = writingDb()
    const svc = new FeatureFlagsService(db as any, {} as any, {} as any, rolesHolding(['u']) as any)
    await assert.rejects(
      () => svc.setFlag('not.a.flag' as any, false, 'workspace', 'ws1', 'ws1', { id: 'u', role: 'member' }),
      /Unknown feature/,
    )
    assert.equal(db.written.length, 0)
  })

  it('allows a super_admin to set a global flag', async () => {
    const db = writingDb()
    const security = { logAuditEvent: async () => undefined }
    const svc = new FeatureFlagsService(db as any, security as any, {} as any, rolesHolding([]) as any)
    await svc.setFlag('goals' as any, true, 'global', null, null, { id: 'u', role: 'super_admin' })
    assert.equal(db.written.length, 1)
  })
})

/**
 * §2.8 gap 11 — "Contact your admin", and what the button actually does.
 *
 * Every outcome here is invisible from the UI: a button that reports success
 * looks the same whether it reached three admins, reached nobody, or was the
 * fourth press in five minutes. The endpoint says which, so the modal can.
 */
describe('§2.8 asking an admin to turn a feature on', () => {
  const MEMBER = [{ role: 'member' }]
  const OFF = [{ scope: 'workspace', scopeId: 'ws1', flagKey: 'ai.meeting_notes', enabled: false }]
  const me = { id: 'u1', name: 'Hamda', email: 'h@example.com' }

  const notifier = () => {
    const sent: any[] = []
    return {
      sent,
      // Delivery, not the row: an admin who has in-app off and email on gets
      // no row and must still count as told.
      createWithOutcome: async (n: any) => (sent.push(n), { row: { id: `n${sent.length}` }, delivered: true }),
    }
  }

  it('refuses a flag that does not exist', async () => {
    const svc = new FeatureFlagsService(dbWithSelects([]), {} as any, notifier() as any, rolesHolding([]) as any)
    await assert.rejects(() => svc.requestFlag('not.a.flag' as any, 'ws1', me), /Unknown feature/)
  })

  it('refuses someone who is not in the workspace', async () => {
    const svc = new FeatureFlagsService(dbWithSelects([[]]), {} as any, notifier() as any, rolesHolding([]) as any)
    await assert.rejects(() => svc.requestFlag('ai.meeting_notes' as any, 'ws1', me), /Not a member/)
  })

  it('does not chase an admin for something already on', async () => {
    // No override row → the platform default (on) stands.
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, []]), {} as any, notifier() as any, rolesHolding(['admin1']) as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'already_enabled')
    assert.equal(out.notified, 0)
  })

  it('tells every holder of workspace.clickapps.manage except the person asking', async () => {
    const n = notifier()
    // Whoever holds the key: an admin by default, or a member a custom role grants it.
    const holders = ['admin1', 'granted-member', 'u1']
    const db = dbWithSelects([MEMBER, OFF, []])
    const svc = new FeatureFlagsService(db, {} as any, n as any, rolesHolding(holders) as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    // The ask is written down in its own right. The once-a-day rule reads
    // THIS, not the notification rows it produced — a workspace whose admins
    // all take email produces no rows at all, and used to be re-mailed on
    // every press because the rule had nothing to find.
    assert.deepEqual(
      db.inserted.map((r: any) => [r.workspaceId, r.flagKey, r.requesterId]),
      [['ws1', 'ai.meeting_notes', 'u1']],
      'the ask itself was never recorded',
    )
    assert.equal(out.status, 'sent')
    assert.equal(out.notified, 2)
    assert.deepEqual(n.sent.map((x) => x.userId), ['admin1', 'granted-member'])
    // The person's own name, not their raw id, and a link to the screen with
    // the toggle on it: this workspace's Settings → Features, which its
    // holders open — not the platform console, which sends them away.
    assert.match(n.sent[0].title, /Hamda/)
    assert.equal(n.sent[0].target.entityId, 'ai.meeting_notes')
    assert.equal(n.sent[0].target.url, '/app/ws1/settings?tab=features')
    assert.match(n.sent[0].body, /Settings → Features/)
    assert.equal(n.sent[0].actorId, 'u1')
  })

  it('counts only the admins who were actually told', async () => {
    // create() returns null when the recipient has muted this kind entirely.
    // Every channel off — the one case where nothing at all happens.
    const muted = { createWithOutcome: async () => ({ row: null, delivered: false }) }
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, OFF, []]), {} as any, muted as any, rolesHolding(['admin1', 'admin2']) as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'sent')
    assert.equal(out.notified, 0, 'reported reaching admins who were never told')
  })

  it('says so when the workspace has no other admin to ask', async () => {
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, OFF]), {} as any, notifier() as any, rolesHolding(['u1']) as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'no_admins')
  })

  it('does not drum-roll: a second ask the same day sends nothing', async () => {
    const n = notifier()
    const recent = [{ id: 'already-asked' }]
    const db = dbWithSelects([MEMBER, OFF, recent])
    const svc = new FeatureFlagsService(db, {} as any, n as any, rolesHolding(['admin1']) as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'already_asked')
    assert.equal(n.sent.length, 0, 'a repeat press notified the admin again')
    assert.equal(db.inserted.length, 0, 'a repeat press was recorded as a fresh ask')
  })

  it('falls back to the email when a person has no name set', async () => {
    const n = notifier()
    const svc = new FeatureFlagsService(
      dbWithSelects([MEMBER, OFF, []]),
      {} as any,
      n as any,
      rolesHolding(['admin1']) as any,
    )
    await svc.requestFlag('ai.meeting_notes' as any, 'ws1', { id: 'u1', name: '  ', email: 'h@example.com' })
    assert.match(n.sent[0].title, /h@example\.com/)
  })
})
