import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FeatureFlagsService } from './feature-flags.service'

// thenable Drizzle chain that resolves to the given rows
const chain = (rows: any[]): any => ({
  from: () => chain(rows),
  where: () => chain(rows),
  limit: () => chain(rows),
  then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
})

/**
 * A db whose selects answer in order. requestFlag runs four of them —
 * membership, flag overrides, admins, a recent ask — and each needs a different
 * answer, which one fixed row set cannot give.
 */
const dbWithSelects = (queue: any[][]) => {
  let i = 0
  return {
    select: () => chain(queue[i++] ?? []),
  } as any
}

describe('FeatureFlagsService.setFlag authorization', () => {
  it('rejects a non-super-admin setting a global flag', async () => {
    const svc = new FeatureFlagsService({} as any, {} as any, {} as any)
    await assert.rejects(
      () => svc.setFlag('x' as any, true, 'global', null, null, { id: 'u', role: 'member' }),
      /super admin/i,
    )
  })

  it('rejects a non-admin setting a workspace flag', async () => {
    const db = { select: () => chain([]) } // membership lookup returns nothing
    const svc = new FeatureFlagsService(db as any, {} as any, {} as any)
    await assert.rejects(
      () => svc.setFlag('x' as any, true, 'workspace', null, 'ws1', { id: 'u', role: 'member' }),
      /workspace admin/i,
    )
  })

  it('allows a super_admin to set a global flag', async () => {
    const db = { insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }) }
    const security = { logAuditEvent: async () => undefined }
    const svc = new FeatureFlagsService(db as any, security as any, {} as any)
    await svc.setFlag('x' as any, true, 'global', null, null, { id: 'u', role: 'super_admin' })
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
    return { sent, create: async (n: any) => (sent.push(n), { id: `n${sent.length}` }) }
  }

  it('refuses a flag that does not exist', async () => {
    const svc = new FeatureFlagsService(dbWithSelects([]), {} as any, notifier() as any)
    await assert.rejects(() => svc.requestFlag('not.a.flag' as any, 'ws1', me), /Unknown feature/)
  })

  it('refuses someone who is not in the workspace', async () => {
    const svc = new FeatureFlagsService(dbWithSelects([[]]), {} as any, notifier() as any)
    await assert.rejects(() => svc.requestFlag('ai.meeting_notes' as any, 'ws1', me), /Not a member/)
  })

  it('does not chase an admin for something already on', async () => {
    // No override row → the platform default (on) stands.
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, []]), {} as any, notifier() as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'already_enabled')
    assert.equal(out.notified, 0)
  })

  it('tells every admin except the person asking', async () => {
    const n = notifier()
    const admins = [{ userId: 'admin1' }, { userId: 'admin2' }, { userId: 'u1' }]
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, OFF, admins, []]), {} as any, n as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'sent')
    assert.equal(out.notified, 2)
    assert.deepEqual(n.sent.map((x) => x.userId), ['admin1', 'admin2'])
    // The person's own name, not their raw id, and a link to the screen with
    // the toggle on it.
    assert.match(n.sent[0].title, /Hamda/)
    assert.equal(n.sent[0].target.entityId, 'ai.meeting_notes')
    assert.equal(n.sent[0].target.url, '/app/admin/features')
    assert.equal(n.sent[0].actorId, 'u1')
  })

  it('counts only the admins who were actually told', async () => {
    // create() returns null when the recipient has muted this kind entirely.
    const muted = { create: async () => null }
    const admins = [{ userId: 'admin1' }, { userId: 'admin2' }]
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, OFF, admins, []]), {} as any, muted as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'sent')
    assert.equal(out.notified, 0, 'reported reaching admins who were never told')
  })

  it('says so when the workspace has no other admin to ask', async () => {
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, OFF, [{ userId: 'u1' }]]), {} as any, notifier() as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'no_admins')
  })

  it('does not drum-roll: a second ask the same day sends nothing', async () => {
    const n = notifier()
    const admins = [{ userId: 'admin1' }]
    const recent = [{ id: 'already-asked' }]
    const svc = new FeatureFlagsService(dbWithSelects([MEMBER, OFF, admins, recent]), {} as any, n as any)
    const out = await svc.requestFlag('ai.meeting_notes' as any, 'ws1', me)
    assert.equal(out.status, 'already_asked')
    assert.equal(n.sent.length, 0, 'a repeat press notified the admin again')
  })

  it('falls back to the email when a person has no name set', async () => {
    const n = notifier()
    const svc = new FeatureFlagsService(
      dbWithSelects([MEMBER, OFF, [{ userId: 'admin1' }], []]),
      {} as any,
      n as any,
    )
    await svc.requestFlag('ai.meeting_notes' as any, 'ws1', { id: 'u1', name: '  ', email: 'h@example.com' })
    assert.match(n.sent[0].title, /h@example\.com/)
  })
})
