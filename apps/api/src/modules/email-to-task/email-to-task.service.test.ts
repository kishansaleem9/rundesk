import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
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
