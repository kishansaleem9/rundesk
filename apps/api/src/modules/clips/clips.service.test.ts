import { BadRequestException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ClipsService } from './clips.service'

function createDbMock(options?: { memberEmail?: string | null }) {
  return {
    select: mock.fn(() => ({
      from: mock.fn(() => ({
        innerJoin: mock.fn(() => ({
          where: mock.fn(() => ({
            limit: mock.fn(async () =>
              options?.memberEmail ? [{ email: options.memberEmail }] : [],
            ),
          })),
        })),
      })),
    })),
  } as any
}

function createR2Mock() {
  return {
    configured: true,
    presignPutObject: mock.fn(async (key: string) => `https://upload.example/${encodeURIComponent(key)}`),
    listObjects: mock.fn(async () => ({
      Contents: [
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
      ],
    })),
    headObject: mock.fn(async (key: string) => ({
      Metadata: {
        title: key.includes('second') ? 'Second clip' : 'First clip',
        durationseconds: key.includes('second') ? '40' : '10',
        recordedby: 'owner@rundesk.dev',
      },
    })),
    getObjectUrl: mock.fn(async (key: string) => `https://cdn.example/${encodeURIComponent(key)}`),
    deleteObject: mock.fn(async () => undefined),
  } as any
}

function createEmailMock() {
  return {
    sendClipSharedEmail: mock.fn(async () => undefined),
  } as any
}

describe('ClipsService', () => {
  it('creates upload URL for clip recording', async () => {
    const r2 = createR2Mock()
    const email = createEmailMock()
    const db = createDbMock()
    const svc = new ClipsService(r2, email, db)

    const result = await svc.createUploadUrl('ws-1', 'owner@rundesk.dev', {
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
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock())
    const clips = await svc.list('ws-1')
    assert.equal(clips.length, 2)
    assert.equal(clips[0].title, 'Second clip')
    assert.equal(clips[1].title, 'First clip')
  })

  it('deletes clip with workspace-bound key', async () => {
    const r2 = createR2Mock()
    const svc = new ClipsService(r2, createEmailMock(), createDbMock())
    const out = await svc.remove('ws-1', 'workspaces/ws-1/clips/a.webm')
    assert.equal(out.ok, true)
    assert.equal(r2.deleteObject.mock.calls.length, 1)
    assert.equal(r2.deleteObject.mock.calls[0].arguments[0], 'workspaces/ws-1/clips/a.webm')
  })

  it('rejects delete for foreign workspace key', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock())
    await assert.rejects(
      () => svc.remove('ws-1', 'workspaces/ws-2/clips/a.webm'),
      (error: unknown) => error instanceof BadRequestException,
    )
  })

  it('shares public clip without triggering email', async () => {
    const email = createEmailMock()
    const svc = new ClipsService(createR2Mock(), email, createDbMock())
    const out = await svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
      storageKey: 'workspaces/ws-1/clips/a.webm',
      mode: 'public',
    })
    assert.ok(out.shareUrl.includes('https://cdn.example/'))
    assert.equal(email.sendClipSharedEmail.mock.calls.length, 0)
  })

  it('shares clip to workspace member and sends email', async () => {
    const email = createEmailMock()
    const svc = new ClipsService(createR2Mock(), email, createDbMock({ memberEmail: 'member@rundesk.dev' }))
    const out = await svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
      storageKey: 'workspaces/ws-1/clips/a.webm',
      mode: 'member',
      userId: 'u-1',
    })
    assert.equal(out.sentTo, 'member@rundesk.dev')
    assert.equal(email.sendClipSharedEmail.mock.calls.length, 1)
  })

  it('throws when sharing to member without userId', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock())
    await assert.rejects(
      () => svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
        storageKey: 'workspaces/ws-1/clips/a.webm',
        mode: 'member',
      }),
      (error: unknown) => error instanceof BadRequestException,
    )
  })

  it('throws when member is missing in workspace', async () => {
    const svc = new ClipsService(createR2Mock(), createEmailMock(), createDbMock({ memberEmail: null }))
    await assert.rejects(
      () => svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
        storageKey: 'workspaces/ws-1/clips/a.webm',
        mode: 'member',
        userId: 'u-404',
      }),
      (error: unknown) => error instanceof NotFoundException,
    )
  })
})
