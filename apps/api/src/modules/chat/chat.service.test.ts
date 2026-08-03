import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ChatService, computeDeliveryStatus, normalizeSaveTags, MAX_GROUP_DM_MEMBERS } from './chat.service'

/**
 * Unit coverage for the chat service. We mock Drizzle's fluent builder with a
 * thenable chain so each top-level `select()` resolves to the next queued result
 * set (message lookup → channel → workspace membership …). `update()` resolves
 * to the next queued update result; inserted/updated/deleted payloads are
 * captured for assertions.
 */
function makeDb(selectResults: any[][], updateResults: any[][] = []) {
  let i = 0
  let u = 0
  const chain = (rows: any[]): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => c,
      leftJoin: () => c,
      innerJoin: () => c,
      orderBy: () => c,
      groupBy: () => c,
      then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  const inserted: any[] = []
  const deleted: any[] = []
  const updated: any[] = []
  const db: any = {
    select: mock.fn(() => chain(selectResults[i++] ?? [])),
    insert: mock.fn(() => ({
      values: (v: any) => {
        inserted.push(v)
        return {
          onConflictDoNothing: async () => undefined,
          onConflictDoUpdate: async () => undefined,
          returning: async () => [],
        }
      },
    })),
    update: mock.fn(() => ({
      set: (v: any) => {
        updated.push(v)
        return { where: () => ({ returning: async () => updateResults[u++] ?? [] }) }
      },
    })),
    delete: mock.fn(() => ({ where: async () => { deleted.push(true) } })),
  }
  return { db, inserted, deleted, updated }
}

function buildSvc(db: any, grantedLevel: string | null = null) {
  const realtime = { emitToWorkspace: mock.fn() } as any
  const notifications = { create: mock.fn(async () => null) } as any
  const tasks = {} as any
  const ai = { isAvailable: () => false } as any
  const r2 = { configured: false, getObjectUrl: async (k: string) => k } as any
  const reminders = { create: mock.fn() } as any
  const presence = { statusFor: mock.fn(async () => ({})) } as any
  // No share grants by default: plain membership decides access, as before.
  const shares = { directLevel: mock.fn(async () => grantedLevel) } as any
  return new ChatService(db, realtime, notifications, tasks, ai, r2, reminders, presence, shares)
}

describe('ChatService.setSaved', () => {
  // message lookup, then assertChannelAccess: channel + workspace membership
  const accessGranted = () => [
    [{ id: 'm1', channelId: 'c1' }],                                  // message exists
    [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false }], // channel (public)
    [{ userId: 'u1' }],                                               // workspace membership
  ]

  it('inserts a save row when saving', async () => {
    const { db, inserted } = makeDb(accessGranted())
    const svc = buildSvc(db)
    const res = await svc.setSaved('m1', 'u1', true)
    assert.deepEqual(res, { messageId: 'm1', saved: true, tags: [] })
    assert.equal(inserted.length, 1)
    assert.deepEqual(inserted[0], { messageId: 'm1', userId: 'u1', tags: [] })
  })

  it('deletes the save row when unsaving', async () => {
    const { db, inserted, deleted } = makeDb(accessGranted())
    const svc = buildSvc(db)
    const res = await svc.setSaved('m1', 'u1', false)
    assert.deepEqual(res, { messageId: 'm1', saved: false })
    assert.equal(inserted.length, 0)
    assert.equal(deleted.length, 1)
  })

  it('throws when the message does not exist', async () => {
    const { db } = makeDb([[]]) // message lookup returns nothing
    const svc = buildSvc(db)
    await assert.rejects(() => svc.setSaved('missing', 'u1', true), /Message not found/)
  })

  it('throws when the caller is not a workspace member', async () => {
    const { db } = makeDb([
      [{ id: 'm1', channelId: 'c1' }],
      [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false }],
      [], // no workspace membership
    ])
    const svc = buildSvc(db)
    await assert.rejects(() => svc.setSaved('m1', 'u1', true), /Workspace membership required/)
  })
})

describe('ChatService.listSaved', () => {
  it('returns the saved rows for the workspace', async () => {
    const rows = [
      { id: 'm1', channelId: 'c1', channelName: 'general', body: 'hi', savedAt: '2026-01-01' },
      { id: 'm2', channelId: 'c2', channelName: 'design', body: 'yo', savedAt: '2026-01-02' },
    ]
    const { db } = makeDb([rows])
    const svc = buildSvc(db)
    const res = await svc.listSaved('w1', 'u1')
    assert.equal(res.length, 2)
    assert.equal(res[0].channelName, 'general')
  })
})

describe('ChatService.extractSpecialMentions (@here / @channel, Plan §6.9)', () => {
  const parse = (body: string) => (buildSvc(makeDb([]).db) as any).extractSpecialMentions(body)

  it('detects @here', () => {
    assert.deepEqual(parse('hey @here standup now'), { here: true, channel: false })
  })
  it('detects @channel at the start', () => {
    assert.deepEqual(parse('@channel please review'), { here: false, channel: true })
  })
  it('detects both, case-insensitively', () => {
    assert.deepEqual(parse('@Here and @CHANNEL'), { here: true, channel: true })
  })
  it('does not match an email-like a@channel.com', () => {
    assert.deepEqual(parse('mail me at a@channel.com'), { here: false, channel: false })
  })
  it('does not match a bare word "here"', () => {
    assert.deepEqual(parse('over here somewhere'), { here: false, channel: false })
  })
})

describe('ChatService.parseReminderWhen (/remind, Plan §6.3)', () => {
  const svc = buildSvc(makeDb([]).db)
  const now = new Date('2026-07-16T12:00:00.000Z')

  it('parses "in 2 hours <note>"', () => {
    const { when, note, phrase } = svc.parseReminderWhen('in 2 hours review the PR', now)
    assert.equal(note, 'review the PR')
    assert.match(phrase, /in 2 hours/)
    assert.equal(when.getTime(), now.getTime() + 2 * 3_600_000)
  })

  it('strips a leading "me" and "to", defaulting to +1 hour with no time', () => {
    const { when, note } = svc.parseReminderWhen('me to call mom', now)
    assert.equal(note, 'call mom')
    assert.equal(when.getTime(), now.getTime() + 3_600_000)
  })

  it('parses "in 30 minutes"', () => {
    const { when, note } = svc.parseReminderWhen('in 30 minutes hydrate', now)
    assert.equal(note, 'hydrate')
    assert.equal(when.getTime(), now.getTime() + 30 * 60_000)
  })
})

describe('ChatService.editMessage (edit history, Plan §6.3)', () => {
  it('snapshots the previous body before overwriting', async () => {
    const { db, inserted, updated } = makeDb(
      [
        [{ id: 'm1', channelId: 'c1', authorId: 'u1', body: 'old body', deletedAt: null }], // existing
        [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false }],                    // channel (access)
        [{ userId: 'u1' }],                                                                  // membership
        [{ id: 'c1', workspaceId: 'w1' }],                                                   // channel (emit)
      ],
      [[{ id: 'm1', channelId: 'c1', body: 'new body', editedAt: new Date() }]],
    )
    const svc = buildSvc(db)
    await svc.editMessage('m1', 'u1', 'new body')
    // A chat_message_edits row captured the prior body.
    const editRow = inserted.find((v) => v && 'previousBody' in v)
    assert.ok(editRow, 'expected a chat_message_edits insert')
    assert.equal(editRow.previousBody, 'old body')
    assert.equal(editRow.messageId, 'm1')
    // The message row was updated to the new body.
    assert.equal(updated.length, 1)
    assert.equal(updated[0].body, 'new body')
  })

  it('does not snapshot a no-op edit', async () => {
    const { db, inserted } = makeDb(
      [
        [{ id: 'm1', channelId: 'c1', authorId: 'u1', body: 'same', deletedAt: null }],
        [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false }],
        [{ userId: 'u1' }],
        [{ id: 'c1', workspaceId: 'w1' }],
      ],
      [[{ id: 'm1', channelId: 'c1', body: 'same', editedAt: new Date() }]],
    )
    const svc = buildSvc(db)
    await svc.editMessage('m1', 'u1', 'same')
    assert.equal(inserted.find((v) => v && 'previousBody' in v), undefined)
  })
})

describe('ChatService.listWorkspaceFiles (file library, Plan §6.8)', () => {
  it('lists files from accessible channels with a signed url, newest first', async () => {
    const { db } = makeDb([
      // accessibleChannelIds → channels (c1 public, c2 private): then memberships (none)
      [
        { id: 'c1', spaceId: null, isPrivate: false, isDm: false },
        { id: 'c2', spaceId: null, isPrivate: true, isDm: false },
      ],
      [], // no channel memberships → only the public c1 is accessible
      // attachments query
      [
        {
          id: 'a1',
          fileName: 'design-spec.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          storageKey: 'chat/c1/attachments/design-spec.pdf',
          createdAt: '2026-01-02',
          channelId: 'c1',
          channelName: 'general',
          messageId: 'm1',
          uploadedById: 'u1',
          uploaderName: 'Alice',
        },
      ],
    ])
    const svc = buildSvc(db)
    const res = await svc.listWorkspaceFiles('w1', 'u1', {})
    assert.equal(res.length, 1)
    assert.equal(res[0].fileName, 'design-spec.pdf')
    assert.equal(res[0].channelName, 'general')
    assert.equal(res[0].uploaderName, 'Alice')
    // r2 is not configured in tests → url falls back to the storage key.
    assert.equal(res[0].url, 'chat/c1/attachments/design-spec.pdf')
  })

  it('returns nothing (and skips the file query) when no channel is accessible', async () => {
    // Only a channel scoped to a PRIVATE space the user is not a member of.
    const { db } = makeDb([
      [{ id: 'c1', spaceId: 's1', isPrivate: false, isDm: false }], // channels
      [], // channel memberships
      [{ id: 's1', visibility: 'private' }], // spaces
      [], // space memberships (not a member) → c1 blocked
    ])
    const svc = buildSvc(db)
    const res = await svc.listWorkspaceFiles('w1', 'u1', {})
    assert.deepEqual(res, [])
  })
})

describe('ChatService.searchMessages (search + filters, Plan §6.11)', () => {
  it('returns matching messages from accessible channels', async () => {
    const { db } = makeDb([
      [{ id: 'c1', spaceId: null, isPrivate: false, isDm: false }], // channels
      [], // memberships
      // messages query
      [
        {
          id: 'm1',
          channelId: 'c1',
          channelName: 'general',
          parentMessageId: null,
          authorId: 'u1',
          authorName: 'Alice',
          body: 'hello world',
          createdAt: '2026-01-01',
        },
      ],
    ])
    const svc = buildSvc(db)
    const res = await svc.searchMessages('w1', 'u1', { q: 'hello' })
    assert.equal(res.length, 1)
    assert.equal(res[0].body, 'hello world')
    assert.equal(res[0].channelName, 'general')
  })

  it('refuses to search a channel the requester cannot access', async () => {
    const { db } = makeDb([
      // c2 is private and the user is not a member → not accessible
      [
        { id: 'c1', spaceId: null, isPrivate: false, isDm: false },
        { id: 'c2', spaceId: null, isPrivate: true, isDm: false },
      ],
      [], // memberships
    ])
    const svc = buildSvc(db)
    // Explicitly filtering to the inaccessible c2 yields no results and no query.
    const res = await svc.searchMessages('w1', 'u1', { channelId: 'c2', q: 'secret' })
    assert.deepEqual(res, [])
  })
})

describe('computeDeliveryStatus (delivery receipts, Plan §6.2)', () => {
  const t0 = new Date('2026-07-16T12:00:00.000Z') // message createdAt
  const before = new Date('2026-07-16T11:59:00.000Z')
  const after = new Date('2026-07-16T12:01:00.000Z')

  it('is "sent" when no other member has received or read it', () => {
    assert.equal(computeDeliveryStatus(t0, [{ lastReadAt: before, lastDeliveredAt: before }]), 'sent')
    assert.equal(computeDeliveryStatus(t0, []), 'sent')
  })

  it('is "delivered" when a member received it but nobody has read it', () => {
    assert.equal(computeDeliveryStatus(t0, [{ lastReadAt: null, lastDeliveredAt: after }]), 'delivered')
    assert.equal(computeDeliveryStatus(t0, [{ lastReadAt: before, lastDeliveredAt: after }]), 'delivered')
  })

  it('is "seen" when any member read it — Seen supersedes Delivered', () => {
    assert.equal(computeDeliveryStatus(t0, [{ lastReadAt: after, lastDeliveredAt: after }]), 'seen')
    // one member only delivered, another has seen → seen wins
    assert.equal(
      computeDeliveryStatus(t0, [
        { lastReadAt: null, lastDeliveredAt: after },
        { lastReadAt: after, lastDeliveredAt: after },
      ]),
      'seen',
    )
  })

  it('treats a receipt exactly at the message time as delivered/seen (>=)', () => {
    assert.equal(computeDeliveryStatus(t0, [{ lastReadAt: null, lastDeliveredAt: new Date(t0) }]), 'delivered')
    assert.equal(computeDeliveryStatus(t0, [{ lastReadAt: new Date(t0), lastDeliveredAt: null }]), 'seen')
  })
})

describe('normalizeSaveTags (bookmark tags, Plan §6.7)', () => {
  it('trims, lowercases, dedupes, and drops empties', () => {
    assert.deepEqual(normalizeSaveTags([' Urgent ', 'urgent', 'FollowUp', '', '   ']), ['urgent', 'followup'])
  })
  it('returns [] for non-array input', () => {
    assert.deepEqual(normalizeSaveTags(undefined), [])
    assert.deepEqual(normalizeSaveTags('nope'), [])
  })
  it('caps at 20 tags', () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`)
    assert.equal(normalizeSaveTags(many).length, 20)
  })
})

describe('ChatService.createGroupDm member cap (Plan §6.2)', () => {
  it(`rejects more than ${MAX_GROUP_DM_MEMBERS} members (creator + peers)`, async () => {
    const { db } = makeDb([]) // cap check runs before any query
    const svc = buildSvc(db)
    // 8 distinct peers + the creator = 9 members → over the cap of 8.
    const peers = Array.from({ length: MAX_GROUP_DM_MEMBERS }, (_, i) => `peer-${i}`)
    await assert.rejects(() => svc.createGroupDm('w1', 'creator', peers), /at most 8 people/)
  })

  it('allows exactly the cap (7 peers + creator = 8) — passes the cap check', async () => {
    // With the max peers the cap passes, so the flow proceeds to workspace
    // membership validation. We return no members, so it fails THERE instead —
    // proving the cap did not reject 7 peers.
    const { db } = makeDb([[]]) // membership query → empty
    const svc = buildSvc(db)
    const peers = Array.from({ length: MAX_GROUP_DM_MEMBERS - 1 }, (_, i) => `peer-${i}`)
    await assert.rejects(() => svc.createGroupDm('w1', 'creator', peers), /membership required/)
  })
})

describe('ChatService.getMessageEdits (Plan §6.3)', () => {
  it('returns prior versions newest-first plus the current body', async () => {
    const { db } = makeDb([
      [{ id: 'm1', channelId: 'c1', body: 'current', editedAt: '2026-01-03' }], // existing
      [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false }],          // channel (access)
      [{ userId: 'u1' }],                                                        // membership
      [
        { id: 'e2', previousBody: 'v1', editedAt: '2026-01-02' },
        { id: 'e1', previousBody: 'v0', editedAt: '2026-01-01' },
      ], // edits
    ])
    const svc = buildSvc(db)
    const res = await svc.getMessageEdits('m1', 'u1')
    assert.equal(res.current.body, 'current')
    assert.equal(res.edits.length, 2)
    assert.equal(res.edits[0].previousBody, 'v1')
  })
})

/**
 * Share & Permissions on a chat conversation. A grant is the only way into a
 * private channel besides membership, and the level it carries decides whether
 * the visitor can actually write.
 */
describe('ChatService channel sharing', () => {
  // assertChannelAccess order: channel → workspace membership → [channel membership]
  const privateChannel = (membership: any[]) => [
    [{ id: 'c1', workspaceId: 'w1', isPrivate: true, isDm: false, spaceId: null }],
    [{ userId: 'u1' }],
    membership,
  ]
  const publicChannel = () => [
    [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false, spaceId: null }],
    [{ userId: 'u1' }],
  ]

  it('lets a granted outsider into a private channel they are not a member of', async () => {
    const { db } = makeDb(privateChannel([]))
    const svc = buildSvc(db, 'view')
    const res = await svc.markChannelRead('c1', 'u1')
    assert.equal(res.ok, true)
  })

  it('still refuses a private channel when there is no membership and no grant', async () => {
    const { db } = makeDb(privateChannel([]))
    const svc = buildSvc(db, null)
    await assert.rejects(() => svc.markChannelRead('c1', 'u1'), /Channel membership required/)
  })

  it('blocks posting at view level', async () => {
    const { db } = makeDb(publicChannel())
    const svc = buildSvc(db, 'view')
    await assert.rejects(
      () => svc.postMessage({ channelId: 'c1', authorId: 'u1', body: 'hi' }),
      /view-only access/,
    )
  })

  it('allows posting at comment level and above', async () => {
    const { db } = makeDb(publicChannel())
    const svc = buildSvc(db, 'comment')
    // Past the permission gate it fails later on unmocked plumbing; what matters
    // is that it is no longer the view-only refusal.
    await assert.rejects(
      () => svc.postMessage({ channelId: 'c1', authorId: 'u1', body: 'hi' }),
      (e: Error) => !/view-only access/.test(e.message),
    )
  })

  it('never writes a member row for a share-only visitor', async () => {
    // A member row outlives the grant, so creating one here would leave the
    // visitor with access after the share is revoked.
    const { db, inserted } = makeDb(privateChannel([]))
    const svc = buildSvc(db, 'view')
    await svc.markChannelRead('c1', 'u1')
    assert.equal(inserted.length, 0, 'expected no chat_channel_members insert')
  })

  it('refuses to let a share-only visitor join the channel', async () => {
    const { db } = makeDb(privateChannel([]))
    const svc = buildSvc(db, 'view')
    await assert.rejects(() => svc.joinChannel('c1', 'u1'), /ask a member to add you/)
  })

  it('keeps a view grant authoritative over a member row', async () => {
    // Opening a channel upserts a member row, so membership must not silently
    // promote a view-only visitor to full posting rights.
    const { db } = makeDb([
      [{ id: 'c1', workspaceId: 'w1', isPrivate: true, isDm: false, spaceId: null }],
      [{ userId: 'u1' }],
      [{ userId: 'u1' }], // they ARE a member now
    ])
    const svc = buildSvc(db, 'view')
    await assert.rejects(
      () => svc.postMessage({ channelId: 'c1', authorId: 'u1', body: 'hi' }),
      /view-only access/,
    )
  })
})

describe('ChatService.markChannelUnread (§A3.3)', () => {
  // assertChannelAccess: channel + workspace membership.
  const access = () => [
    [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false, spaceId: null }],
    [{ userId: 'u1' }],
  ]

  it('rewinds the cursor to just before the named message', async () => {
    const at = new Date('2026-07-16T12:00:00.000Z')
    const { db, inserted } = makeDb([...access(), [{ createdAt: at, channelId: 'c1' }]])
    const svc = buildSvc(db)
    const res = await svc.markChannelUnread('c1', 'u1', 'm9')
    assert.equal(res.lastReadAt?.getTime(), at.getTime() - 1)
    assert.equal(inserted[0].lastReadAt.getTime(), at.getTime() - 1)
  })

  it('rewinds to the newest message from someone else when no message is named', async () => {
    const at = new Date('2026-07-16T09:30:00.000Z')
    const { db, inserted } = makeDb([...access(), [{ createdAt: at }]])
    const svc = buildSvc(db)
    const res = await svc.markChannelUnread('c1', 'u1')
    assert.equal(res.lastReadAt?.getTime(), at.getTime() - 1)
    assert.equal(inserted.length, 1)
  })

  it('clears the cursor when there is nothing to go back to', async () => {
    const { db, inserted } = makeDb([...access(), []])
    const svc = buildSvc(db)
    const res = await svc.markChannelUnread('c1', 'u1')
    assert.equal(res.lastReadAt, null)
    assert.equal(inserted[0].lastReadAt, null)
  })

  it('refuses a message from another channel', async () => {
    const { db } = makeDb([...access(), [{ createdAt: new Date(), channelId: 'other' }]])
    const svc = buildSvc(db)
    await assert.rejects(() => svc.markChannelUnread('c1', 'u1', 'm9'), /Message not found/)
  })
})

describe('ChatService.listWorkspaceFiles channel scope (§A3.7)', () => {
  it('narrows to one channel without widening access', async () => {
    const { db } = makeDb([
      [
        { id: 'c1', spaceId: null, isPrivate: false, isDm: false },
        { id: 'c2', spaceId: null, isPrivate: true, isDm: false },
      ],
      [], // no channel memberships → c2 stays out of reach
    ])
    const svc = buildSvc(db)
    // Asking for the private channel's files yields nothing and skips the query.
    assert.deepEqual(await svc.listWorkspaceFiles('w1', 'u1', { channelId: 'c2' }), [])
  })
})
