import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BriefingService, isBriefingDue } from './briefing.service'

/**
 * §7.11 — the hourly briefing cron fires for a user iff their briefing is
 * enabled, the current UTC hour matches their configured hour, and they have
 * not already been briefed today. These lock down that selection predicate and
 * the dispatch loop's due-user + dedupe behavior without a live model or SMTP.
 */

describe('isBriefingDue (cron due-user selection)', () => {
  const at = (iso: string) => new Date(iso)

  it('never fires when the briefing is disabled', () => {
    assert.equal(isBriefingDue({ enabled: false, hour: 9 }, null, at('2026-07-16T09:00:00Z')), false)
  })

  it('fires only at the configured UTC hour', () => {
    assert.equal(isBriefingDue({ enabled: true, hour: 9 }, null, at('2026-07-16T09:00:00Z')), true)
    assert.equal(isBriefingDue({ enabled: true, hour: 9 }, null, at('2026-07-16T08:00:00Z')), false)
    assert.equal(isBriefingDue({ enabled: true, hour: 9 }, null, at('2026-07-16T10:00:00Z')), false)
  })

  it('respects hour 0 (midnight UTC)', () => {
    assert.equal(isBriefingDue({ enabled: true, hour: 0 }, null, at('2026-07-16T00:00:00Z')), true)
    assert.equal(isBriefingDue({ enabled: true, hour: 0 }, null, at('2026-07-16T01:00:00Z')), false)
  })

  it('skips a user already briefed earlier the same UTC day', () => {
    assert.equal(isBriefingDue({ enabled: true, hour: 9 }, '2026-07-16', at('2026-07-16T09:00:00Z')), false)
  })

  it('fires again once the day rolls over', () => {
    assert.equal(isBriefingDue({ enabled: true, hour: 9 }, '2026-07-15', at('2026-07-16T09:00:00Z')), true)
  })
})

/** Mock db whose every select() chain resolves to the queued rows in order. */
function makeDb(queue: any[][]) {
  let i = 0
  const chain = (rows: any[]): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      groupBy: () => c,
      limit: () => c,
      then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  return { select: () => chain(queue[i++] ?? []) } as any
}

describe('BriefingService.dispatch — due-user selection + delivery (§7.11)', () => {
  const now = new Date('2026-07-16T09:00:00Z') // hour 9 UTC

  it('delivers only to enabled users whose hour matches, as ai_briefing notifications', async () => {
    const recipients = [
      { userId: 'u1', email: 'u1@x.com', displayName: 'Ada', enabled: true, hour: 9 }, // due
      { userId: 'u2', email: 'u2@x.com', displayName: 'Bo', enabled: true, hour: 10 }, // wrong hour
      { userId: 'u3', email: 'u3@x.com', displayName: 'Cy', enabled: false, hour: 9 }, // disabled
    ]
    const created: any[] = []
    const notifications: any = {
      listBriefingRecipients: async () => recipients,
      create: async (n: any) => {
        created.push(n)
        return n
      },
    }
    const ai: any = { generateBriefing: async () => 'Good morning, Ada.' }
    // Queue: usersBriefedOn → none; then for u1: assigned tasks, blocking, membership.
    const db = makeDb([[], [], [], []])
    const svc = new BriefingService(db, ai, notifications)

    const res = await svc.dispatch(now)
    assert.deepEqual(res, { candidates: 3, due: 1, sent: 1 })
    assert.equal(created.length, 1)
    assert.equal(created[0].userId, 'u1')
    assert.equal(created[0].type, 'ai_briefing')
    assert.match(created[0].title, /daily briefing/i)
    assert.equal(created[0].body, 'Good morning, Ada.')
  })

  it('skips a user already briefed today (dedupe) so it never double-sends', async () => {
    const recipients = [{ userId: 'u1', email: 'u1@x.com', displayName: 'Ada', enabled: true, hour: 9 }]
    const created: any[] = []
    const notifications: any = {
      listBriefingRecipients: async () => recipients,
      create: async (n: any) => created.push(n),
    }
    const ai: any = { generateBriefing: async () => 'body' }
    // usersBriefedOn returns u1 → already briefed today.
    const db = makeDb([[{ userId: 'u1' }]])
    const svc = new BriefingService(db, ai, notifications)

    const res = await svc.dispatch(now)
    assert.deepEqual(res, { candidates: 1, due: 1, sent: 0 })
    assert.equal(created.length, 0)
  })

  it('does nothing when no recipient is due this hour', async () => {
    const notifications: any = {
      listBriefingRecipients: async () => [{ userId: 'u2', email: 'u2@x.com', displayName: 'Bo', enabled: true, hour: 10 }],
      create: async () => assert.fail('should not deliver'),
    }
    const svc = new BriefingService(makeDb([]), { generateBriefing: async () => '' } as any, notifications)
    const res = await svc.dispatch(now)
    assert.deepEqual(res, { candidates: 1, due: 0, sent: 0 })
  })
})
