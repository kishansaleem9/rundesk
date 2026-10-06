import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { EmailToTaskService } from './email-to-task.service'

/**
 * The service blends DB / R2 / realtime with deterministic parsing.
 * These tests focus on the parsing + idempotency + size-limit paths
 * that don't need an actual database — the bulk of the integration
 * logic is exercised end-to-end via the webhook tests in higher tiers.
 */

function buildSvc() {
  const db = {
    select: mock.fn(() => ({
      from: mock.fn(() => ({
        where: mock.fn(() => ({ limit: mock.fn(async () => []) })),
      })),
    })),
    insert: mock.fn(() => ({
      values: mock.fn(() => ({
        onConflictDoNothing: mock.fn(async () => undefined),
        onConflictDoUpdate: mock.fn(async () => undefined),
        returning: mock.fn(async () => [{ id: 'x-1' }]),
      })),
    })),
    update: mock.fn(() => ({
      set: mock.fn(() => ({ where: mock.fn(async () => undefined) })),
    })),
    delete: mock.fn(() => ({ where: mock.fn(async () => undefined) })),
  } as any
  const r2 = { putObject: mock.fn(async () => undefined) } as any
  const realtime = { emitToList: mock.fn(), emitToTask: mock.fn() } as any
  return new EmailToTaskService(db, r2, realtime)
}

describe('EmailToTaskService.parseRecipient', () => {
  it('parses a bare list alias', () => {
    const svc = buildSvc()
    assert.deepEqual(svc.parseRecipient('list-abc123@inbound.rundesk.app'), {
      localPart: 'abc123',
    })
  })

  it('parses a sub-addressed task reply', () => {
    const svc = buildSvc()
    assert.deepEqual(
      svc.parseRecipient('list-abc123+task-11111111-1111-1111-1111-111111111111@inbound.rundesk.app'),
      { localPart: 'abc123', taskId: '11111111-1111-1111-1111-111111111111' },
    )
  })

  it('lower-cases the recipient', () => {
    const svc = buildSvc()
    assert.deepEqual(svc.parseRecipient('LIST-AbcDef@INBOUND.example.com'), {
      localPart: 'abcdef',
    })
  })

  it('rejects unprefixed addresses', () => {
    const svc = buildSvc()
    assert.equal(svc.parseRecipient('hello@example.com'), null)
    assert.equal(svc.parseRecipient('list-@example.com'), null)
  })

  it('rejects malformed addresses', () => {
    const svc = buildSvc()
    assert.equal(svc.parseRecipient(''), null)
    assert.equal(svc.parseRecipient('@example.com'), null)
    assert.equal(svc.parseRecipient('plainstring'), null)
    assert.equal(svc.parseRecipient('list-abc+task-@example.com'), null) // empty task id
  })
})

describe('EmailToTaskService.ingest dedupe', () => {
  it('rejects a duplicate Message-Id without re-processing', async () => {
    const svc = buildSvc()
    // Override findExistingByMessageId by patching the private method via cast
    ;(svc as any).findExistingByMessageId = async () => ({ id: 'prev-1' })
    const result = await svc.ingest({
      messageId: '<dup@example.com>',
      fromAddress: 'alice@example.com',
      recipient: 'list-abc@inbound.rundesk.local',
    })
    assert.equal(result.outcome, 'rejected_duplicate')
  })

  it('rejects payloads larger than 25MB', async () => {
    const svc = buildSvc()
    ;(svc as any).findExistingByMessageId = async () => null
    ;(svc as any).resolveReplyContext = async () => null
    ;(svc as any).recordOutcome = async () => undefined

    const huge = Buffer.alloc(26 * 1024 * 1024)
    const result = await svc.ingest({
      messageId: '<huge@example.com>',
      fromAddress: 'alice@example.com',
      recipient: 'list-abc@inbound.rundesk.local',
      attachments: [{ fileName: 'x.bin', contentType: 'application/octet-stream', content: huge }],
    })
    assert.equal(result.outcome, 'rejected_too_large')
    assert.match(result.reason ?? '', /exceeds 25MB/)
  })

  it('rejects an unrecognised recipient with rejected_no_alias', async () => {
    const svc = buildSvc()
    ;(svc as any).findExistingByMessageId = async () => null
    ;(svc as any).resolveReplyContext = async () => null
    ;(svc as any).recordOutcome = async () => undefined

    const result = await svc.ingest({
      messageId: '<m1@example.com>',
      fromAddress: 'alice@example.com',
      recipient: 'random@example.com',
    })
    assert.equal(result.outcome, 'rejected_no_alias')
  })
})

/*
 * A LIST IN THE TRASH TAKES NO TASK, MAILED OR NOT, AND ITS ADDRESS IS STILL ITS
 * OWN TO MANAGE (`found-5-oct/default-list-files-into-an-archived-list`). Mail
 * inserts its task itself, past `createTask` and its gate, so mail to a deleted
 * list's address went on making tasks in it; and the gate's trash refusal,
 * reaching the address's own routes as a plain no, refused its reading,
 * rotating and revoking (403).
 */
const TRASHED_LIST = '33333333-3333-4333-8333-333333333333'

/** A queued Drizzle stand-in: each select answers the next rows; inserts are kept by the table they write. */
function queuedSvc(selects: unknown[][]) {
  const queue = [...selects]
  const inserts: Array<{ table: unknown; values: unknown }> = []
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  const db = {
    select: mock.fn(() => node(queue.shift() ?? [])),
    insert: mock.fn((table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values })
        const r: any = Promise.resolve([{ id: 'made-1' }])
        r.onConflictDoNothing = async () => undefined
        r.onConflictDoUpdate = () => ({ returning: async () => [{ id: 'alias-1', listId: TRASHED_LIST, localPart: 'abc', revokedAt: null }] })
        r.returning = async () => [{ id: 'made-1' }]
        return r
      },
    })),
    update: mock.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  } as any
  const svc = new EmailToTaskService(db, { putObject: mock.fn(async () => undefined) } as any, { emitToList: mock.fn(), emitToTask: mock.fn() } as any)
  return { svc, db, inserts, left: () => queue.length }
}

describe('EmailToTaskService — a list in the trash', () => {
  it('makes no task from mail to the address of a list in the trash: rejected, and recorded saying why', async () => {
    const { svc, inserts } = queuedSvc([[{ inTrash: true, deletedById: 'the-admin' }]])
    ;(svc as any).findExistingByMessageId = async () => null
    ;(svc as any).resolveReplyContext = async () => null
    ;(svc as any).findAliasByLocalPart = async () => ({ id: 'alias-1', listId: TRASHED_LIST, localPart: 'abc', revokedAt: null, createdById: 'u1', defaultPriority: 'normal' })
    const recorded: unknown[][] = []
    ;(svc as any).recordOutcome = async (...args: unknown[]) => { recorded.push(args) }
    const result = await svc.ingest({ messageId: '<trash@example.com>', fromAddress: 'alice@example.com', recipient: 'list-abc@inbound.rundesk.local', subject: 'into the trash' })
    assert.equal(result.outcome, 'rejected_not_allowed')
    assert.equal(result.reason, 'the list is in the trash')
    assert.equal(inserts.length, 0, 'a task was made in a list in the trash')
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0][2], 'rejected_not_allowed')
    assert.equal(recorded[0][4], TRASHED_LIST)
  })

  it('makes no task from mail to the address of a list whose project is in the trash, and records why (found-6-oct/task-fallback-files-into-a-deleted-project)', async () => {
    const { svc, inserts } = queuedSvc([[{ inTrash: false, deletedById: null }], [{ projectInTrash: true, projectDeletedById: 'the-admin' }]])
    ;(svc as any).findExistingByMessageId = async () => null
    ;(svc as any).resolveReplyContext = async () => null
    ;(svc as any).findAliasByLocalPart = async () => ({ id: 'alias-1', listId: TRASHED_LIST, localPart: 'abc', revokedAt: null, createdById: 'u1', defaultPriority: 'normal' })
    const recorded: unknown[][] = []
    ;(svc as any).recordOutcome = async (...args: unknown[]) => { recorded.push(args) }
    const result = await svc.ingest({ messageId: '<held@example.com>', fromAddress: 'alice@example.com', recipient: 'list-abc@inbound.rundesk.local', subject: 'into a deleted project' })
    assert.equal(result.outcome, 'rejected_not_allowed')
    assert.equal(result.reason, "the list's project is in the trash")
    assert.equal(inserts.length, 0, 'a task was made in a list whose project is in the trash')
    assert.equal(recorded.length, 1)
  })

  it('still reads a deleted list’s address to somebody who may add tasks to it but for the trash', async () => {
    // The create gate's selects: the list's home (in the trash), the account, the read rule's (the list, the
    // workspace role, the project's folder), then the space's level at Full edit; then the address itself.
    const { svc, left } = queuedSvc([
      [{ workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null, inTrash: true, deletedById: 'the-admin' }],
      [{ role: 'member' }],
      [{ listId: TRASHED_LIST, listVisibility: 'public', listCreatedById: 'the-admin', projectId: 'p1', projectVisibility: 'public', spaceId: 's1', spaceVisibility: 'public' }],
      [{ role: 'workspace_admin' }],
      [],
      [{ id: 'alias-1', listId: TRASHED_LIST, localPart: 'abc', revokedAt: null, defaultPriority: 'normal', lastUsedAt: null, createdAt: new Date() }],
    ])
    const view = await svc.getAlias(TRASHED_LIST, 'the-admin')
    assert.ok(view, 'the address was refused, or not found')
    assert.equal(left(), 0)
  })
})

/*
 * THE ADDRESS THERE IS, HANDED BACK ONLY TO THOSE WHO MAY ADD TASKS TO THE LIST
 * (`found-6-oct/list-address-given-by-post-to-those-who-may-not-add`): `POST`
 * returned a live address to anybody who could name the list, before asking
 * them anything, so a view-only member refused it by `GET` was given it.
 */
describe('EmailToTaskService.ensureAlias — the address there is', () => {
  const ALIAS = { id: 'alias-1', listId: TRASHED_LIST, localPart: 'abc', revokedAt: null, defaultPriority: 'normal', lastUsedAt: null, createdAt: new Date() }
  const asking = (mayManage: boolean) => {
    const { svc } = queuedSvc([])
    const asked: string[] = []
    ;(svc as any).assertListExists = async () => { asked.push('the list') }
    ;(svc as any).assertCanManageAlias = async (_list: string, actor: string) => {
      asked.push(`may ${actor} add`)
      if (!mayManage) throw new ForbiddenException('Only those who may add tasks to this list manage its email address')
    }
    ;(svc as any).findAliasByListId = async () => { asked.push('the address'); return ALIAS }
    return { svc, asked }
  }

  it('asks its caller what minting asks before it reads the address there is: refused, it hands back nothing; allowed, the address as it is', async () => {
    const refused = asking(false)
    await assert.rejects(() => refused.svc.ensureAlias(TRASHED_LIST, 'a-viewer'), ForbiddenException)
    assert.deepEqual(refused.asked, ['the list', 'may a-viewer add'], 'the address was read before its caller was asked')
    const allowed = asking(true)
    const view = await allowed.svc.ensureAlias(TRASHED_LIST, 'an-editor')
    assert.equal(view.localPart, 'abc')
    assert.deepEqual(allowed.asked, ['the list', 'may an-editor add', 'the address'])
  })
})
