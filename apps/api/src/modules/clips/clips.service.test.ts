import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ClipsService } from './clips.service'
import { CLIP_DELETE_REFUSAL, CLIP_READ_REFUSAL } from './clip-access'

/*
 * THE VALUES A QUERY WAS ASKED FOR, read off drizzle's condition: `eq(col, v)`
 * binds `v` as a `Param`, and `and(…)` nests them. So the fake below answers
 * the question the service asked — this token, this key, this member — rather
 * than whatever was queued, and a rule that asks about the wrong row is caught.
 */
function paramValues(cond: unknown): unknown[] {
  const out: unknown[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.constructor?.name === 'Param') {
      out.push(node.value)
      return
    }
    if (Array.isArray(node.queryChunks)) node.queryChunks.forEach(walk)
    else if (Array.isArray(node)) node.forEach(walk)
  }
  walk(cond)
  return out
}

type Link = { workspaceId: string; storageKey: string; token: string; createdById: string }

/**
 * A database holding the clip links, which workspaces block public sharing,
 * and who is a member of what. Each select is told apart by the fields it
 * names, which is how the service writes each of its questions.
 */
function createDbMock(options?: {
  memberEmail?: string | null
  links?: Link[]
  blocked?: string[]
  archived?: string[]
  members?: string[]
  /** Every insert meets a unique conflict, as a token clash or a racing insert would. */
  insertConflicts?: boolean
}) {
  const state = {
    links: [...(options?.links ?? [])],
    blocked: new Set(options?.blocked ?? []),
    archived: new Set(options?.archived ?? []),
    members: new Set(options?.members ?? []),
  }
  const answer = (fields: string, params: unknown[]) => {
    switch (fields) {
      case 'token':
        return state.links.filter((l) => l.storageKey === params[0]).map((l) => ({ token: l.token }))
      case 'blockPublicSharing,storageKey,workspaceArchived,workspaceId':
        return state.links
          .filter((l) => l.token === params[0])
          .map((l) => ({
            workspaceId: l.workspaceId,
            storageKey: l.storageKey,
            blockPublicSharing: state.blocked.has(l.workspaceId),
            workspaceArchived: state.archived.has(l.workspaceId),
          }))
      case 'blockPublicSharing':
        return [{ blockPublicSharing: state.blocked.has(params[0] as string) }]
      case 'userId':
        return state.members.has(`${params[0]}:${params[1]}`) ? [{ userId: params[1] }] : []
      case 'email':
        return options?.memberEmail ? [{ email: options.memberEmail }] : []
      default:
        throw new Error(`the fake database was asked for ${fields}`)
    }
  }
  const db = {
    state,
    select: mock.fn((fields?: Record<string, unknown>) => {
      const names = Object.keys(fields ?? {}).sort().join(',')
      let params: unknown[] = []
      const q: any = {
        from: () => q,
        innerJoin: () => q,
        where: (cond: unknown) => {
          params = paramValues(cond)
          return q
        },
        limit: async () => answer(names, params),
      }
      return q
    }),
    insert: mock.fn(() => ({
      values: (values: Link) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (options?.insertConflicts) return []
            state.links.push(values)
            return [{ token: values.token }]
          },
        }),
      }),
    })),
    delete: mock.fn(() => ({
      // Lazy, as drizzle's query is: nothing is deleted until it is awaited.
      where: (cond: unknown) => ({
        then: (resolve: () => void) => {
          const [workspaceId, storageKey] = paramValues(cond)
          state.links = state.links.filter((l) => !(l.workspaceId === workspaceId && l.storageKey === storageKey))
          resolve()
        },
      }),
    })),
  }
  return db as any
}

function createR2Mock(stored: string[] = ['workspaces/ws-1/clips/a.webm']) {
  const objects = new Set(stored)
  return {
    configured: true,
    presignPutObject: mock.fn(async (key: string) => `https://upload.example/${encodeURIComponent(key)}`),
    listAllObjects: mock.fn(async () => [
      {
        Key: 'workspaces/ws-1/clips/200-second.webm',
        Size: 200,
        LastModified: new Date('2026-05-08T10:00:00Z'),
      },
      {
        Key: 'workspaces/ws-1/clips/100-first.webm',
        Size: 100,
        LastModified: new Date('2026-05-08T09:00:00Z'),
      },
    ]),
    headObject: mock.fn(async (key: string) => {
      if (key.startsWith('workspaces/ws-1/clips/1') || key.startsWith('workspaces/ws-1/clips/2')) {
        return {
          Metadata: {
            title: key.includes('second') ? 'Second clip' : 'First clip',
            durationseconds: key.includes('second') ? '40' : '10',
            recordedby: 'owner@rundesk.dev',
          },
        }
      }
      if (!objects.has(key)) throw Object.assign(new Error('NotFound'), { name: 'NotFound' })
      return {
        Metadata: { title: 'Demo clip', durationseconds: '15', recordedby: 'owner@rundesk.dev' },
        ContentType: 'video/webm',
        LastModified: new Date('2026-09-29T10:00:00Z'),
      }
    }),
    getObjectUrl: mock.fn(
      async (key: string, seconds = 900) => `https://cdn.example/${encodeURIComponent(key)}?X-Amz-Expires=${seconds}`,
    ),
    deleteObject: mock.fn(async (key: string) => {
      objects.delete(key)
    }),
  } as any
}

function createEmailMock() {
  return {
    sendClipSharedEmail: mock.fn(async () => undefined),
  } as any
}

/** The environment: nothing set but what a test names. */
const config = (env: Record<string, string> = {}) => ({ get: (k: string) => env[k] }) as any

const KEY = 'workspaces/ws-1/clips/a.webm'
/** A token in the shape `link` mints. */
const TOKEN = 'T'.repeat(32)
/** Who asks for a link or a share, as `ClipsService.readerOf` reads them: members, who read every clip. */
const ACTOR_1 = { id: 'actor-1', email: 'actor-1@rundesk.dev', role: 'member' }
const ACTOR_2 = { id: 'actor-2', email: 'actor-2@rundesk.dev', role: 'member' }

/*
 * WHO ASKS (`found-5-oct/guests-read-and-delete-every-clip`). The mock's clips
 * were recorded by owner@rundesk.dev, before a clip carried its recorder's id.
 */
const ADMIN = { id: 'admin-1', email: 'admin@rundesk.dev', role: 'workspace_admin' }
const MEMBER = { id: 'member-1', email: 'member@rundesk.dev', role: 'member' }
const OWNER = { id: 'owner-1', email: 'owner@rundesk.dev', role: 'member' }
const GUEST = { id: 'guest-1', email: 'guest@rundesk.dev', role: 'guest' }

describe('ClipsService', () => {
  it('creates upload URL for clip recording', async () => {
    const r2 = createR2Mock()
    const email = createEmailMock()
    const db = createDbMock()
    const svc = new ClipsService(r2, email, db, config())

    const result = await svc.createUploadUrl('ws-1', { id: 'owner-1', email: 'owner@rundesk.dev' }, {
      fileName: 'demo clip.webm',
      contentType: 'video/webm',
      durationSeconds: 15,
      title: 'Demo clip',
    })

    assert.ok(result.uploadUrl.includes('https://upload.example/'))
    assert.ok(result.storageKey.includes('workspaces/ws-1/clips/'))
    assert.equal(r2.presignPutObject.mock.calls.length, 1)
  })

  it('lists clips sorted by newest first', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock(), config())
    const clips = await svc.list('ws-1', MEMBER)
    assert.equal(clips.length, 2)
    assert.equal(clips[0].title, 'Second clip')
    assert.equal(clips[1].title, 'First clip')
  })

  it('lists the newest 200 of a workspace with more, and looks up only those', async () => {
    const r2 = createR2Mock()
    // Oldest first, as a listing answers: key order is the order they were made.
    const all = Array.from({ length: 250 }, (_, i) => ({
      Key: `workspaces/ws-1/clips/${1000 + i}-clip.webm`,
      Size: 1,
      LastModified: new Date(Date.UTC(2026, 4, 8, 9, 0, i)),
    }))
    r2.listAllObjects = mock.fn(async () => all)
    const clips = await new ClipsService(r2, createEmailMock(), createDbMock(), config()).list('ws-1', MEMBER)
    assert.equal(clips.length, 200)
    assert.equal(clips[0].storageKey, 'workspaces/ws-1/clips/1249-clip.webm')
    assert.equal(clips[199].storageKey, 'workspaces/ws-1/clips/1050-clip.webm')
    assert.equal(r2.headObject.mock.calls.length, 200)
  })

  it('deletes clip with workspace-bound key', async () => {
    const r2 = createR2Mock()
    const svc = new ClipsService(r2, createEmailMock(), createDbMock(), config())
    const out = await svc.remove('ws-1', 'workspaces/ws-1/clips/a.webm', ADMIN)
    assert.equal(out.ok, true)
    assert.equal(r2.deleteObject.mock.calls.length, 1)
    assert.equal(r2.deleteObject.mock.calls[0].arguments[0], 'workspaces/ws-1/clips/a.webm')
  })

  it('rejects delete for foreign workspace key', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock(), config())
    await assert.rejects(
      () => svc.remove('ws-1', 'workspaces/ws-2/clips/a.webm', ADMIN),
      (error: unknown) => error instanceof BadRequestException,
    )
  })

  /*
   * The key that walked out: it starts with this workspace's clip prefix, so a
   * `startsWith` check let it through, and its `..` segments land on another
   * workspace's object once a browser, or the store, collapses them.
   */
  const WALK = 'workspaces/ws-1/clips/../../../workspaces/ws-2/tasks/t-1/attachments/1-secret.pdf'

  it('refuses to delete a key that walks out of the workspace’s clips, and deletes nothing', async () => {
    const r2 = createR2Mock()
    const svc = new ClipsService(r2, createEmailMock(), createDbMock(), config())
    await assert.rejects(
      () => svc.remove('ws-1', WALK, ADMIN),
      (error: unknown) => error instanceof BadRequestException,
    )
    assert.equal(r2.deleteObject.mock.calls.length, 0)
  })

  it('refuses to share a key that walks out of the workspace’s clips, and signs nothing', async () => {
    const r2 = createR2Mock()
    const db = createDbMock()
    const svc = new ClipsService(r2, createEmailMock(), db, config())
    await assert.rejects(
      () => svc.share('ws-1', ACTOR_1, 'owner@rundesk.dev', { storageKey: WALK, mode: 'public' }),
      (error: unknown) => error instanceof BadRequestException,
    )
    assert.equal(r2.getObjectUrl.mock.calls.length, 0)
    assert.equal(db.state.links.length, 0)
  })

  it('shares public clip without triggering email', async () => {
    const email = createEmailMock()
    const r2 = createR2Mock()
    const svc = new ClipsService(r2, email, createDbMock(), config({ APP_URL: 'https://rundesk.example/' }))
    const out = await svc.share('ws-1', ACTOR_1, 'owner@rundesk.dev', {
      storageKey: 'workspaces/ws-1/clips/a.webm',
      mode: 'public',
    })
    // `resume-defects/resume-7`: the clip's link, not a signed storage URL.
    assert.equal(out.shareUrl, `https://rundesk.example/clips/${out.token}`)
    assert.equal(r2.getObjectUrl.mock.calls.length, 0)
    assert.equal(email.sendClipSharedEmail.mock.calls.length, 0)
  })

  it('shares clip to workspace member and sends email', async () => {
    const email = createEmailMock()
    const svc = new ClipsService(createR2Mock(), email, createDbMock({ memberEmail: 'member@rundesk.dev' }), config())
    const out = await svc.share('ws-1', ACTOR_1, 'owner@rundesk.dev', {
      storageKey: 'workspaces/ws-1/clips/a.webm',
      mode: 'member',
      userId: 'u-1',
    })
    assert.equal(out.sentTo, 'member@rundesk.dev')
    assert.equal(email.sendClipSharedEmail.mock.calls.length, 1)
  })

  it('throws when sharing to member without userId', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock(), config())
    await assert.rejects(
      () => svc.share('ws-1', ACTOR_1, 'owner@rundesk.dev', {
        storageKey: 'workspaces/ws-1/clips/a.webm',
        mode: 'member',
      }),
      (error: unknown) => error instanceof BadRequestException,
    )
  })

  it('throws when member is missing in workspace', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock({ memberEmail: null }), config())
    await assert.rejects(
      () => svc.share('ws-1', ACTOR_1, 'owner@rundesk.dev', {
        storageKey: 'workspaces/ws-1/clips/a.webm',
        mode: 'member',
        userId: 'u-404',
      }),
      (error: unknown) => error instanceof NotFoundException,
    )
  })
})

/*
 * `found-5-oct/guests-read-and-delete-every-clip` — WHO READS AND DELETES A
 * CLIP. A guest was listed every clip of the workspace, each signed, and
 * deleted the admin's; a member deleted another member's. A store of three:
 * the guest's own (carrying its recorder's id), one recorded before the id by
 * owner@rundesk.dev, and a member's. `test/e2e/clip-library-access.mjs` asks
 * the same of a real store and the clips page.
 */
function storeOfThree() {
  const objects = new Map<string, { LastModified: Date; meta: Record<string, string> }>([
    ['workspaces/ws-1/clips/300-guest.webm', {
      LastModified: new Date('2026-10-05T10:00:00Z'),
      meta: { title: 'Guest clip', recordedby: 'guest@rundesk.dev', recordedbyid: 'guest-1' },
    }],
    ['workspaces/ws-1/clips/200-owner.webm', {
      LastModified: new Date('2026-10-05T09:00:00Z'),
      meta: { title: 'Owner clip', recordedby: 'owner@rundesk.dev' },
    }],
    ['workspaces/ws-1/clips/100-member.webm', {
      LastModified: new Date('2026-10-05T08:00:00Z'),
      meta: { title: 'Member clip', recordedby: 'member@rundesk.dev', recordedbyid: 'member-1' },
    }],
  ])
  return {
    objects,
    configured: true,
    // Key order, as a listing answers.
    listAllObjects: mock.fn(async () =>
      [...objects].map(([Key, o]) => ({ Key, Size: 1, LastModified: o.LastModified })).sort((a, b) => (a.Key < b.Key ? -1 : 1)),
    ),
    headObject: mock.fn(async (key: string) => {
      const o = objects.get(key)
      if (!o) throw Object.assign(new Error('NotFound'), { name: 'NotFound' })
      return { Metadata: o.meta, ContentType: 'video/webm', LastModified: o.LastModified }
    }),
    getObjectUrl: mock.fn(async (key: string) => `https://cdn.example/${encodeURIComponent(key)}`),
    deleteObject: mock.fn(async (key: string) => {
      objects.delete(key)
    }),
  } as any
}

describe('ClipsService — who reads and deletes a clip', () => {
  const service = (r2: unknown, db = createDbMock()) => new ClipsService(r2 as any, createEmailMock(), db, config())
  const OWNERS = 'workspaces/ws-1/clips/200-owner.webm'

  it('the upload names its recorder by id as well as by address', async () => {
    const r2 = createR2Mock()
    await service(r2).createUploadUrl('ws-1', { id: 'owner-1', email: 'owner@rundesk.dev' }, {
      fileName: 'demo.webm',
      contentType: 'video/webm',
    })
    const meta = r2.presignPutObject.mock.calls[0].arguments[2]
    assert.equal(meta.recordedby, 'owner@rundesk.dev')
    assert.equal(meta.recordedbyid, 'owner-1')
  })

  it('a guest’s library is the clips they recorded: nobody else’s is listed or signed', async () => {
    const r2 = storeOfThree()
    const clips = await service(r2).list('ws-1', GUEST)
    assert.deepEqual(clips.map((c) => c.title), ['Guest clip'])
    assert.deepEqual(r2.getObjectUrl.mock.calls.map((c: any) => c.arguments[0]), ['workspaces/ws-1/clips/300-guest.webm'])
  })

  it('a guest’s library looks past the newest 200 for theirs', async () => {
    const r2 = storeOfThree()
    // 250 clips by somebody else, every one newer than the guest's.
    for (let i = 0; i < 250; i++) {
      r2.objects.set(`workspaces/ws-1/clips/${1000 + i}-other.webm`, {
        LastModified: new Date(Date.UTC(2026, 9, 6, 0, 0, i)),
        meta: { title: `Other ${i}`, recordedby: 'member@rundesk.dev', recordedbyid: 'member-1' },
      })
    }
    const clips = await service(r2).list('ws-1', GUEST)
    assert.deepEqual(clips.map((c) => c.title), ['Guest clip'])
  })

  it('every listed clip says whether its reader may delete it', async () => {
    const r2 = storeOfThree()
    const asOwner = await service(r2).list('ws-1', OWNER)
    assert.deepEqual(asOwner.map((c) => [c.title, c.mayDelete]), [
      ['Guest clip', false],
      ['Owner clip', true],
      ['Member clip', false],
    ])
    assert.deepEqual((await service(r2).list('ws-1', ADMIN)).map((c) => c.mayDelete), [true, true, true])
    assert.deepEqual((await service(r2).list('ws-1', GUEST)).map((c) => [c.title, c.mayDelete]), [['Guest clip', true]])
  })

  it('a delete by somebody who neither recorded the clip nor manages the workspace is refused, saying who may, and nothing is deleted', async () => {
    const r2 = storeOfThree()
    const db = createDbMock({ links: [{ workspaceId: 'ws-1', storageKey: OWNERS, token: TOKEN, createdById: 'owner-1' }] })
    for (const reader of [MEMBER, GUEST]) {
      await assert.rejects(
        () => service(r2, db).remove('ws-1', OWNERS, reader),
        (e: unknown) => e instanceof ForbiddenException && e.message === CLIP_DELETE_REFUSAL,
      )
    }
    assert.equal(r2.deleteObject.mock.calls.length, 0)
    assert.equal(db.state.links.length, 1)
    // A key that names no clip is not found, rather than refused.
    await assert.rejects(
      () => service(r2, db).remove('ws-1', 'workspaces/ws-1/clips/999-never.webm', MEMBER),
      (e: unknown) => e instanceof NotFoundException,
    )
  })

  it('a guest is refused the link, and so every share, of a clip they did not record, told which clips are theirs, and no link is made', async () => {
    const r2 = storeOfThree()
    const db = createDbMock()
    for (const key of [OWNERS, 'workspaces/ws-1/clips/100-member.webm']) {
      await assert.rejects(
        () => service(r2, db).link('ws-1', GUEST, key),
        (e: unknown) => e instanceof ForbiddenException && e.message === CLIP_READ_REFUSAL,
      )
      for (const mode of ['public', 'external', 'member'] as const) {
        await assert.rejects(
          () => service(r2, db).share('ws-1', GUEST, GUEST.email, { storageKey: key, mode, userId: 'member-1', email: 'friend@elsewhere.test' }),
          (e: unknown) => e instanceof ForbiddenException && e.message === CLIP_READ_REFUSAL,
        )
      }
    }
    assert.equal(db.state.links.length, 0)
    // Their own is theirs to link, and a member links anybody's.
    assert.match((await service(r2, db).link('ws-1', GUEST, 'workspaces/ws-1/clips/300-guest.webm')).token, /^[A-Za-z0-9_-]{32}$/)
    assert.match((await service(r2, db).link('ws-1', MEMBER, OWNERS)).token, /^[A-Za-z0-9_-]{32}$/)
    // A key naming no clip is not found, rather than refused.
    await assert.rejects(
      () => service(r2, db).link('ws-1', GUEST, 'workspaces/ws-1/clips/999-never.webm'),
      (e: unknown) => e instanceof NotFoundException,
    )
  })

  it('its recorder deletes it; somebody who manages the workspace deletes anybody’s, without looking it up', async () => {
    const r2 = storeOfThree()
    // Recorded before the id: theirs by address. And the guest's own, by id.
    assert.equal((await service(r2).remove('ws-1', OWNERS, OWNER)).ok, true)
    assert.equal((await service(r2).remove('ws-1', 'workspaces/ws-1/clips/300-guest.webm', GUEST)).ok, true)
    const looked = r2.headObject.mock.calls.length
    assert.equal((await service(r2).remove('ws-1', 'workspaces/ws-1/clips/100-member.webm', ADMIN)).ok, true)
    assert.equal(r2.headObject.mock.calls.length, looked)
    assert.deepEqual([...r2.objects.keys()], [])
  })
})

/*
 * `resume-defects/resume-7` — A CLIP'S LINK. Copy link and New tab handed out
 * the signed storage URL, asked for a day, and nothing said so. ClickUp's clip
 * URL is an unguessable string anyone holding it can open, and a clip is kept
 * until it is deleted; so the link is `/clips/<token>`, the same one every
 * time, and opening it signs the clip again. `test/e2e/clip-links.mjs` asks
 * the same of a real database, a real store and a browser.
 */
describe('ClipsService — a clip’s link', () => {
  it('is /clips/<an unguessable token>, made once: asked again, the same link comes back', async () => {
    const db = createDbMock()
    const svc = new ClipsService(createR2Mock(), createEmailMock(), db, config())
    const first = await svc.link('ws-1', ACTOR_1, KEY)
    assert.match(first.token, /^[A-Za-z0-9_-]{32}$/)
    assert.equal(first.path, `/clips/${first.token}`)
    assert.equal(first.audience, 'anyone')
    const again = await svc.link('ws-1', ACTOR_2, KEY)
    assert.equal(again.token, first.token)
    assert.equal(db.state.links.length, 1)
    assert.deepEqual(
      { ...db.state.links[0], token: '' },
      { workspaceId: 'ws-1', storageKey: KEY, token: '', createdById: 'actor-1' },
    )
  })

  it('answers with the row already there when its insert meets another', async () => {
    const db = createDbMock({ insertConflicts: true })
    const svc = new ClipsService(createR2Mock(), createEmailMock(), db, config())
    // Somebody else's insert for this clip lands between the look and the write.
    const originalInsert = db.insert
    db.insert = mock.fn((...args: unknown[]) => {
      db.state.links.push({ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-2' })
      return originalInsert(...args)
    })
    const out = await svc.link('ws-1', ACTOR_1, KEY)
    assert.equal(out.token, TOKEN)
  })

  it('is refused for a key that is not one of this workspace’s clips, and for a clip that is not stored', async () => {
    const db = createDbMock()
    const svc = new ClipsService(createR2Mock(), createEmailMock(), db, config())
    for (const key of ['workspaces/ws-2/clips/a.webm', 'workspaces/ws-1/clips/../../../workspaces/ws-2/clips/a.webm', 42]) {
      await assert.rejects(() => svc.link('ws-1', ACTOR_1, key), (e: unknown) => e instanceof BadRequestException)
    }
    await assert.rejects(
      () => svc.link('ws-1', ACTOR_1, 'workspaces/ws-1/clips/never-uploaded.webm'),
      (e: unknown) => e instanceof NotFoundException,
    )
    assert.equal(db.state.links.length, 0)
  })

  it('says it opens for members only where the workspace blocks public sharing', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock({ blocked: ['ws-1'] }), config())
    assert.equal((await svc.link('ws-1', ACTOR_1, KEY)).audience, 'members')
  })

  it('opening it signs the clip again, for the configured time, and says what it is', async () => {
    const r2 = createR2Mock()
    const links = [{ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-1' }]
    const svc = new ClipsService(r2, createEmailMock(), createDbMock({ links }), config({ CLIP_PLAYBACK_URL_SECONDS: '5' }))
    const first = await svc.watch(TOKEN, null)
    const second = await svc.watch(TOKEN, null)
    assert.equal(first.title, 'Demo clip')
    assert.equal(first.durationSeconds, 15)
    assert.equal(first.expiresInSeconds, 5)
    assert.equal(first.audience, 'anyone')
    assert.equal(r2.getObjectUrl.mock.calls.length, 2)
    assert.deepEqual(r2.getObjectUrl.mock.calls.map((c: any) => c.arguments), [[KEY, 5], [KEY, 5]])
    assert.ok(second.url.startsWith('https://cdn.example/'))
  })

  it('signs for an hour when nothing is configured', async () => {
    const r2 = createR2Mock()
    const links = [{ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-1' }]
    const svc = new ClipsService(r2, createEmailMock(), createDbMock({ links }), config({ CLIP_PLAYBACK_URL_SECONDS: 'soon' }))
    assert.equal((await svc.watch(TOKEN, null)).expiresInSeconds, 3600)
  })

  it('a token that is not one, a token nobody holds and a clip that is gone are not found, and nothing is signed', async () => {
    const r2 = createR2Mock([])
    const db = createDbMock({ links: [{ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-1' }] })
    const svc = new ClipsService(r2, createEmailMock(), db, config())
    for (const token of ['short', `${TOKEN}/..`, 'U'.repeat(32), TOKEN, undefined]) {
      await assert.rejects(() => svc.watch(token, null), (e: unknown) => e instanceof NotFoundException)
    }
    assert.equal(r2.getObjectUrl.mock.calls.length, 0)
    // The malformed ones were refused before anything was read.
    assert.equal(db.select.mock.calls.length, 2)
  })

  it('where the workspace blocks public sharing, asks nobody to sign in, refuses a non-member, and plays for a member', async () => {
    const r2 = createR2Mock()
    const links = [{ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-1' }]
    const svc = new ClipsService(
      r2,
      createEmailMock(),
      createDbMock({ links, blocked: ['ws-1'], members: ['ws-1:member-1'] }),
      config(),
    )
    await assert.rejects(() => svc.watch(TOKEN, null), (e: unknown) => e instanceof UnauthorizedException)
    await assert.rejects(() => svc.watch(TOKEN, { id: 'outsider-1', role: 'member' }), (e: unknown) => e instanceof NotFoundException)
    assert.equal(r2.getObjectUrl.mock.calls.length, 0)
    const watched = await svc.watch(TOKEN, { id: 'member-1', role: 'member' })
    assert.equal(watched.audience, 'members')
    assert.equal(r2.getObjectUrl.mock.calls.length, 1)
  })

  it('where public sharing is open, plays for somebody from another workspace as for anyone', async () => {
    const links = [{ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-1' }]
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock({ links }), config())
    assert.equal((await svc.watch(TOKEN, { id: 'outsider-1', role: 'member' })).title, 'Demo clip')
  })

  it('closes while its workspace is archived, and nothing is signed', async () => {
    const r2 = createR2Mock()
    const links = [{ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-1' }]
    const svc = new ClipsService(r2, createEmailMock(), createDbMock({ links, archived: ['ws-1'] }), config())
    await assert.rejects(() => svc.watch(TOKEN, null), (e: unknown) => e instanceof NotFoundException)
    assert.equal(r2.getObjectUrl.mock.calls.length, 0)
  })

  it('is gone once the clip is deleted', async () => {
    const r2 = createR2Mock()
    const db = createDbMock({ links: [{ workspaceId: 'ws-1', storageKey: KEY, token: TOKEN, createdById: 'actor-1' }] })
    const svc = new ClipsService(r2, createEmailMock(), db, config())
    await svc.remove('ws-1', KEY, ADMIN)
    assert.equal(db.state.links.length, 0)
    await assert.rejects(() => svc.watch(TOKEN, null), (e: unknown) => e instanceof NotFoundException)
  })

  it('an email share carries the link and says who can open it, and an external one is refused where public sharing is blocked', async () => {
    const email = createEmailMock()
    const svc = new ClipsService(createR2Mock(), email, createDbMock(), config({ APP_URL: 'https://rundesk.example' }))
    const out = await svc.share('ws-1', ACTOR_1, 'owner@rundesk.dev', { storageKey: KEY, mode: 'external', email: 'friend@elsewhere.test' })
    const sent = email.sendClipSharedEmail.mock.calls[0].arguments[0]
    assert.equal(sent.clipUrl, `https://rundesk.example/clips/${out.token}`)
    assert.equal(sent.audience, 'anyone')
    assert.equal('expiresAt' in sent, false)

    const blockedEmail = createEmailMock()
    const blocked = new ClipsService(createR2Mock(), blockedEmail, createDbMock({ blocked: ['ws-1'] }), config())
    await assert.rejects(
      () => blocked.share('ws-1', ACTOR_1, 'owner@rundesk.dev', { storageKey: KEY, mode: 'external', email: 'friend@elsewhere.test' }),
      (e: unknown) => e instanceof ForbiddenException,
    )
    assert.equal(blockedEmail.sendClipSharedEmail.mock.calls.length, 0)
  })
})
