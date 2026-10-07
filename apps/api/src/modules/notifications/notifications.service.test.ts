import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import webpush from 'web-push'
import { NotificationsService, resolveNotificationUrl } from './notifications.service'

/**
 * Covers the two §10 fixes owned by this service:
 *   1. §6.9/§10.2 — the `mobile` notification channel is delivered over the same
 *      Web Push (VAPID) transport as `web` (Rundesk is a PWA), deduped so a user
 *      with BOTH channels on isn't double-pushed to the same subscription.
 *   2. §10.1 — the read path exposes a resolvable click-through `url` per
 *      notification so the frontend can jump to the relevant item.
 *
 * DB is the same hand-rolled mock idiom used by the other notifications tests.
 */

// --- mocked-DB plumbing -----------------------------------------------------

/** A drizzle-ish terminal that is both awaitable and `.limit()`-able. */
function chainable(rows: any[]) {
  return {
    then: (resolve: (v: any) => void, reject?: (e: any) => void) =>
      Promise.resolve(rows).then(resolve, reject),
    limit: async () => rows,
  }
}

/**
 * DB for `create()`: each `.select()...where()` shifts the next queued result
 * (1st = the user's prefs/timezone row, optional 2nd = web_push_subscriptions),
 * and `.insert().values().returning()` yields the inserted notification.
 */
function buildCreateDb(selectQueue: any[][], insertedRow: any) {
  const queue = [...selectQueue]
  return {
    select: () => ({
      from: () => ({
        where: () => chainable(queue.shift() ?? []),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [insertedRow] }),
    }),
    delete: () => ({ where: async () => undefined }),
  } as any
}

/** DB for `list()`: the join chain resolves to the supplied joined rows. */
function buildListDb(joinedRows: any[]) {
  return {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => joinedRows }),
          }),
        }),
      }),
    }),
  } as any
}

function stubConfig(vapid?: { publicKey: string; privateKey: string }) {
  return {
    get: (k: string) => {
      if (k === 'APP_URL') return 'https://app.test'
      if (k === 'WEB_PUSH_SUBJECT') return 'mailto:test@rundesk.internal'
      if (vapid && k === 'WEB_PUSH_PUBLIC_KEY') return vapid.publicKey
      if (vapid && k === 'WEB_PUSH_PRIVATE_KEY') return vapid.privateKey
      return undefined
    },
  } as any
}

const INSERTED = {
  id: 'notif-1',
  workspaceId: 'ws1',
  type: 'task_assigned',
  title: 'You were assigned',
  body: null,
  target: { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' },
  readAt: null,
  createdAt: new Date(),
}

type Matrix = { inApp: boolean; web: boolean; mobile: boolean; email: boolean }

/** `task_assigned` maps to the `assigned` event key; patch only that matrix. */
function prefsFor(matrix: Matrix, dnd = false) {
  return {
    channels: { dndOn: dnd, dndStart: '00:00', dndEnd: '00:00' },
    events: { assigned: matrix },
  }
}

function createArgs() {
  return {
    userId: 'u1',
    workspaceId: 'ws1',
    type: 'task_assigned' as const,
    title: 'You were assigned',
    target: { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' },
  }
}

// --- §6.9/§10.2 — mobile push delivery via Web Push -------------------------

describe('NotificationsService.create — mobile push rides the Web Push transport', () => {
  /** Build a service whose `sendWebPush` is replaced by a call-recording stub. */
  function serviceWith(matrix: Matrix, dnd = false) {
    const db = buildCreateDb(
      [[{ notificationPreferences: prefsFor(matrix, dnd), timezone: 'UTC' }]],
      INSERTED,
    )
    const realtime = { emitToUser: mock.fn() }
    const svc = new NotificationsService(db, realtime as any, {} as any, stubConfig())
    // The item's read rule is the notification-reach tests' (`notification-reach.test.ts`); here the recipient may read it.
    ;(svc as any).recipientMayRead = async () => true
    const pushes: Array<{ userId: string; payload: any }> = []
    ;(svc as any).sendWebPush = async (userId: string, payload: any) => {
      pushes.push({ userId, payload })
    }
    return { svc, realtime, pushes }
  }

  it('delivers a web push when only the mobile channel is enabled', async () => {
    const { svc, pushes } = serviceWith({ inApp: false, web: false, mobile: true, email: false })
    await svc.create(createArgs())
    assert.equal(pushes.length, 1)
    assert.equal(pushes[0].userId, 'u1')
    assert.equal(pushes[0].payload.url, 'https://app.test/app/ws1/s/p/l?task=t1')
  })

  it('sends exactly ONE web push when both web and mobile are enabled (dedupe)', async () => {
    const { svc, pushes } = serviceWith({ inApp: false, web: true, mobile: true, email: false })
    await svc.create(createArgs())
    // One sendWebPush invocation — not one per channel — so the fan-out hits each
    // subscription a single time.
    assert.equal(pushes.length, 1)
  })

  it('still delivers a web push for the web channel alone (unchanged behavior)', async () => {
    const { svc, pushes } = serviceWith({ inApp: false, web: true, mobile: false, email: false })
    await svc.create(createArgs())
    assert.equal(pushes.length, 1)
  })

  it('does NOT web-push when neither web nor mobile is enabled (in-app only)', async () => {
    const { svc, pushes } = serviceWith({ inApp: true, web: false, mobile: false, email: false })
    await svc.create(createArgs())
    assert.equal(pushes.length, 0)
  })

  it('suppresses the mobile web push during quiet hours', async () => {
    // dndStart === dndEnd ⇒ always in quiet hours.
    const { svc, pushes } = serviceWith({ inApp: true, web: false, mobile: true, email: false }, true)
    await svc.create(createArgs())
    assert.equal(pushes.length, 0)
  })

  it('enriches the realtime payload with the click-through url', async () => {
    const { svc, realtime } = serviceWith({ inApp: false, web: false, mobile: true, email: false })
    await svc.create(createArgs())
    assert.equal(realtime.emitToUser.mock.calls.length, 1)
    const payload = realtime.emitToUser.mock.calls[0].arguments[1] as any
    assert.equal(payload.notification.url, '/app/ws1/s/p/l?task=t1')
  })

  it('with BOTH channels on, each subscription is pushed exactly once (real fan-out)', async () => {
    const vapid = webpush.generateVAPIDKeys()
    const subs = [
      { id: 's1', endpoint: 'https://push.example/s1', p256dh: 'k1', auth: 'a1' },
      { id: 's2', endpoint: 'https://push.example/s2', p256dh: 'k2', auth: 'a2' },
    ]
    const db = buildCreateDb(
      [
        [{ notificationPreferences: prefsFor({ inApp: false, web: true, mobile: true, email: false }), timezone: 'UTC' }],
        subs,
      ],
      INSERTED,
    )
    const svc = new NotificationsService(db, { emitToUser: mock.fn() } as any, {} as any, stubConfig(vapid))
    ;(svc as any).recipientMayRead = async () => true

    const original = webpush.sendNotification
    let sent = 0
    ;(webpush as any).sendNotification = async () => {
      sent += 1
      return {}
    }
    try {
      await svc.create(createArgs())
      // sendWebPush is fire-and-forget — let the async fan-out settle.
      await new Promise((r) => setTimeout(r, 25))
      // 2 subscriptions × 1 delivery each — NOT ×2 for the two enabled channels.
      assert.equal(sent, 2)
    } finally {
      ;(webpush as any).sendNotification = original
    }
  })
})

// --- found-6-oct/an-open-socket-outlives-its-access — nothing about an item its recipient may not read

/*
 * A task's followers, a doc's author, the person a reminder is for were chosen
 * when they could read the item, and nothing asked again: measured on lane 2,
 * people whose access had ended went on being notified about a task they
 * followed — on their open socket, in their inbox, by mail — with its new title
 * in the notification's own. The item's read rule is asked first
 * (`notification-reach.ts`), with the recipient's account role.
 */
describe('NotificationsService.create — nothing about an item its recipient may not read', () => {
  it('a notification about an item its recipient may not read now is neither written, sent, mailed nor pushed, and one they may read is all four', async () => {
    for (const may of [false, true]) {
      const db = buildCreateDb(
        [[{ notificationPreferences: prefsFor({ inApp: true, web: true, mobile: true, email: true }), timezone: 'UTC', role: 'member' }]],
        INSERTED,
      )
      let written = 0
      const insert = db.insert
      db.insert = () => { written += 1; return insert() }
      const realtime = { emitToUser: mock.fn() }
      const svc = new NotificationsService(db, realtime as any, {} as any, stubConfig())
      const asked: unknown[] = []
      ;(svc as any).recipientMayRead = async (data: any, role: string | null) => {
        asked.push([data.userId, data.workspaceId, data.target?.entityType, data.target?.entityId, role])
        return may
      }
      const mailed: unknown[] = []
      ;(svc as any).sendEmail = async (d: unknown) => { mailed.push(d) }
      const pushed: unknown[] = []
      ;(svc as any).sendWebPush = async (_u: string, p: unknown) => { pushed.push(p) }
      const outcome = await svc.createWithOutcome(createArgs())
      await new Promise((resolve) => setImmediate(resolve))
      assert.deepEqual(asked, [['u1', 'ws1', 'task', 't1', 'member']], 'the item’s read rule was not asked, or not with the recipient and their account role')
      const went = { written, sent: realtime.emitToUser.mock.calls.length, mailed: mailed.length, pushed: pushed.length, delivered: outcome.delivered }
      assert.deepEqual(
        went,
        may ? { written: 1, sent: 1, mailed: 1, pushed: 1, delivered: true } : { written: 0, sent: 0, mailed: 0, pushed: 0, delivered: false },
        may ? 'a notification its recipient may read did not go out' : 'a notification about an item its recipient may not read went out',
      )
    }
  })
})

// --- §10.1 — resolvable click-through url -----------------------------------

describe('resolveNotificationUrl', () => {
  it('prefers the deep-link stored on target.url (trimmed)', () => {
    assert.equal(
      resolveNotificationUrl({ workspaceId: 'ws1', target: { entityType: 'task', entityId: 't1', url: '  /app/ws1/board?task=t1  ' } }),
      '/app/ws1/board?task=t1',
    )
  })

  it('falls back to a route per entity type when no url is stored', () => {
    const ws = 'ws1'
    assert.equal(resolveNotificationUrl({ workspaceId: ws, target: { entityType: 'task', entityId: 't9' } }), '/app/ws1/tasks/t9')
    assert.equal(resolveNotificationUrl({ workspaceId: ws, target: { entityType: 'doc', entityId: 'd9' } }), '/app/ws1/docs?doc=d9')
    assert.equal(resolveNotificationUrl({ workspaceId: ws, target: { entityType: 'chat_message', entityId: 'm9' } }), '/app/ws1/chat')
    assert.equal(resolveNotificationUrl({ workspaceId: ws, target: { entityType: 'timesheet', entityId: 'x' } }), '/app/ws1/time/approvals')
    assert.equal(resolveNotificationUrl({ workspaceId: ws, target: { entityType: 'insights', entityId: 'x' } }), '/app/ws1/insights')
    assert.equal(resolveNotificationUrl({ workspaceId: ws, target: { entityType: 'workload', entityId: 'u1' } }), '/app/ws1/insights')
    assert.equal(resolveNotificationUrl({ workspaceId: ws, target: { entityType: 'billing', entityId: 'ws1' } }), '/app/ws1/settings')
  })

  it('returns null (never throws) when there is nothing to resolve', () => {
    assert.equal(resolveNotificationUrl({ workspaceId: 'ws1', target: null }), null)
    assert.equal(resolveNotificationUrl({ workspaceId: 'ws1' }), null)
    assert.equal(resolveNotificationUrl({ workspaceId: 'ws1', target: { entityType: 'task' } }), null) // no entityId
    assert.equal(resolveNotificationUrl({ workspaceId: null, target: { entityType: 'task', entityId: 't1' } }), null) // no workspace
    assert.equal(resolveNotificationUrl({ workspaceId: 'ws1', target: { entityType: 'mystery', entityId: 'z' } }), null)
  })
})

describe('NotificationsService.list — url/target enrichment (§10.1)', () => {
  it('adds a top-level url per notification and preserves the raw target + actor', async () => {
    const rows = [
      {
        notifications: {
          id: 'n1', type: 'task_assigned', title: 'Assigned', body: null, workspaceId: 'ws1',
          target: { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' }, readAt: null, createdAt: new Date(),
        },
        users: { id: 'u2', displayName: 'Bob', email: 'bob@example.com' },
      },
      {
        notifications: {
          id: 'n2', type: 'ai_briefing', title: 'Briefing', body: null, workspaceId: 'ws1',
          target: null, readAt: null, createdAt: new Date(),
        },
        users: null,
      },
      {
        notifications: {
          id: 'n3', type: 'task_due_soon', title: 'Due soon', body: null, workspaceId: 'ws2',
          target: { entityType: 'task', entityId: 't3' }, readAt: null, createdAt: new Date(),
        },
        users: null,
      },
    ]
    const svc = new NotificationsService(buildListDb(rows), {} as any, {} as any, stubConfig())
    const res = await svc.list('u1')

    assert.equal(res.length, 3)
    // stored url surfaced verbatim + raw target kept + actor mapped
    assert.equal(res[0].url, '/app/ws1/s/p/l?task=t1')
    assert.deepEqual(res[0].target, { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' })
    assert.equal(res[0].actor.displayName, 'Bob')
    // no target ⇒ null url (not a crash)
    assert.equal(res[1].url, null)
    // entity ref without a url ⇒ best-effort fallback route
    assert.equal(res[2].url, '/app/ws2/tasks/t3')
  })
})

// --- resume-defects/resume-8 — every mail about a task carries its thread ----

describe('NotificationsService.sendEmail — the thread a reply to a mail about a task follows', () => {
  it('a mail about a task is sent with the thread kept for it, whatever its type; a mail about a chat message with none', async () => {
    const CASES: Array<{ type: string; sender: string; emailContext?: Record<string, unknown> }> = [
      { type: 'task_assigned', sender: 'sendTaskAssigned' },
      { type: 'task_mentioned', sender: 'sendMention' },
      { type: 'task_commented', sender: 'sendComment' },
      { type: 'task_commented', sender: 'sendCommentResolved', emailContext: { commentVariant: 'resolved' } },
      { type: 'task_due_soon', sender: 'sendDueSoon' },
      { type: 'task_overdue', sender: 'sendOverdue' },
      { type: 'task_status_changed', sender: 'sendActivity' },
      { type: 'comment_assigned', sender: 'sendActivity' },
    ]
    const PERSON = { email: 'person@example.test', displayName: 'Person' }
    const db = buildCreateDb(Array.from({ length: CASES.length + 1 }, () => [PERSON]), INSERTED)
    const sent: unknown[] = []
    const email = new Proxy({}, {
      get: (_target, sender) => async (opts: { messageId?: string; replyTo?: string }) => {
        sent.push([sender, opts.messageId ?? null, opts.replyTo ?? null])
      },
    })
    const svc = new NotificationsService(db, {} as any, email as any, stubConfig())
    const kept: unknown[] = []
    ;(svc as any).replyThread = async (taskId: string, recipient: string) => {
      kept.push([taskId, recipient])
      return { messageId: `<notify.${taskId}@inbound.test>`, replyTo: `list-a+task-${taskId}@inbound.test` }
    }
    for (const c of CASES) {
      await (svc as any).sendEmail({
        userId: 'u1', workspaceId: 'ws1', type: c.type, title: 'Something about the task',
        target: { entityType: 'task', entityId: 't1', url: '/app/ws1/tasks/t1' },
        emailContext: c.emailContext,
      })
    }
    // A mention in chat is a `task_mentioned` too, about a message: no task to answer on.
    await (svc as any).sendEmail({
      userId: 'u1', workspaceId: 'ws1', type: 'task_mentioned', title: 'You were mentioned',
      target: { entityType: 'chat_message', entityId: 'm1', url: '/app/ws1/chat?message=m1' },
    })
    assert.deepEqual(sent, [
      ...CASES.map((c) => [c.sender, '<notify.t1@inbound.test>', 'list-a+task-t1@inbound.test']),
      ['sendMention', null, null],
    ])
    assert.deepEqual(kept, CASES.map(() => ['t1', PERSON.email]), 'a thread was kept for a mail about no task, or not for one about a task')
  })
})
