import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { webhooks, webhookDeliveries } from '@rundesk/db'
import { WebhooksService } from './webhooks.service'

/**
 * Outbound-webhook SSRF hardening. The delivery path runs through the shared
 * `safeFetch` guard, so a webhook pointed at a private/reserved address (e.g.
 * the 169.254.169.254 cloud-metadata endpoint) can neither be created nor used
 * to read internal responses. All checks here are synchronous literal-IP/scheme
 * rejections, so no real network is touched.
 */

/** Chainable drizzle stand-in: a queue of select results + captured writes. */
function makeDb(selects: unknown[][] = []) {
  const selectQueue = [...selects]
  const inserts: Array<{ table: unknown; values: any }> = []
  const updates: Array<{ table: unknown; set: any }> = []
  const VERBS = ['from', 'where', 'orderBy', 'limit', 'returning'] as const
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of VERBS) p[v] = () => p
    return p
  }
  const db = {
    select: () => node(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (v: any) => {
        inserts.push({ table, values: v })
        return node([{ id: 'new-id', ...v }])
      },
    }),
    update: (table: unknown) => ({
      set: (s: any) => {
        updates.push({ table, set: s })
        return { where: () => node([{ id: 'upd', ...s }]) }
      },
    }),
  } as any
  return { db, inserts, updates }
}

const isBadRequest = (err: unknown): err is BadRequestException => err instanceof BadRequestException

describe('WebhooksService.create — URL safety', () => {
  it('rejects a private/reserved-IP webhook URL (SSRF into cloud metadata) and persists nothing', async () => {
    const { db, inserts } = makeDb()
    const svc = new WebhooksService(db)
    await assert.rejects(
      () =>
        svc.create('ws-1', 'user-1', {
          name: 'evil',
          url: 'http://169.254.169.254/latest/meta-data/',
          events: ['task.created'],
        }),
      isBadRequest,
    )
    assert.equal(inserts.length, 0, 'nothing persisted')
  })

  it('rejects loopback and non-http(s) schemes', async () => {
    const { db } = makeDb()
    const svc = new WebhooksService(db)
    await assert.rejects(
      () => svc.create('ws-1', 'user-1', { name: 'x', url: 'http://127.0.0.1/hook', events: ['task.created'] }),
      isBadRequest,
    )
    await assert.rejects(
      () => svc.create('ws-1', 'user-1', { name: 'x', url: 'file:///etc/passwd', events: ['task.created'] }),
      isBadRequest,
    )
  })

  it('persists a webhook with a public https URL (and generates a secret)', async () => {
    const { db, inserts } = makeDb()
    const svc = new WebhooksService(db)
    const row = await svc.create('ws-1', 'user-1', {
      name: 'ok',
      url: 'https://example.com/hook',
      events: ['task.created'],
    })
    assert.ok(row)
    assert.equal(inserts.length, 1)
    assert.equal(inserts[0].table, webhooks)
    assert.equal(inserts[0].values.url, 'https://example.com/hook')
    assert.ok(inserts[0].values.secret, 'a secret was generated')
  })

  it('update rejects repointing an existing webhook at an internal address', async () => {
    // assertOwnership select → an existing benign webhook.
    const existing = { id: 'wh-1', workspaceId: 'ws-1', url: 'https://example.com/hook' }
    const { db, updates } = makeDb([[existing]])
    const svc = new WebhooksService(db)
    await assert.rejects(
      () => svc.update('ws-1', 'wh-1', { url: 'http://10.0.0.5/internal' }),
      isBadRequest,
    )
    assert.equal(updates.length, 0, 'no write when the new URL is blocked')
  })
})

describe('WebhooksService delivery — blocked host records a failure', () => {
  it('records a failed delivery (no retries) when the target resolves to a blocked address', async () => {
    const hook = {
      id: 'wh-1',
      workspaceId: 'ws-1',
      url: 'http://169.254.169.254/',
      secret: 'sek',
      successCount: 0,
      failureCount: 0,
    }
    // assertOwnership select → [hook]
    const { db, inserts, updates } = makeDb([[hook]])
    const svc = new WebhooksService(db)

    const res = await svc.testWebhook('ws-1', 'wh-1')
    assert.deepEqual(res, { ok: true })

    // A delivery row was recorded as a failure, with the SSRF block as the body.
    const deliveryInserts = inserts.filter((r) => r.table === webhookDeliveries)
    assert.equal(deliveryInserts.length, 1)
    const rec = deliveryInserts[0].values
    assert.equal(rec.success, false)
    assert.equal(rec.statusCode, undefined)
    assert.equal(rec.attempts, 1, 'an SSRF block is permanent — not retried')
    assert.match(String(rec.responseBody), /blocked|private|reserved/i)

    // The webhook's failure counter was bumped (not the success counter).
    const whUpdates = updates.filter((u) => u.table === webhooks)
    assert.equal(whUpdates.length, 1)
    assert.equal(whUpdates[0].set.failureCount, 1)
  })
})
