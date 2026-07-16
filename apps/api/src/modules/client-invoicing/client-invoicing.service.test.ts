import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import {
  clientInvoices,
  clientInvoiceLineItems,
  timeEntries,
  projects,
  clients,
} from '@rundesk/db'
import { ClientInvoicingService } from './client-invoicing.service'

/**
 * A drizzle-shaped fake DB. `selectRows(table)` answers the current `.from()`
 * table; inserts/updates are captured for assertions and `.returning()` echoes
 * the written values (with a synthetic id) so the service can keep working. No
 * real Postgres or Stripe is touched.
 */
function makeDb(selectRows: (table: unknown) => any[] = () => []) {
  const inserts: Array<{ table: unknown; values: any }> = []
  const updates: Array<{ table: unknown; set: any }> = []

  const insertReturning = (table: unknown, values: any): any[] => {
    if (table === clientInvoices) return [{ id: 'inv-1', ...values }]
    if (table === clientInvoiceLineItems && Array.isArray(values)) {
      return values.map((v, i) => ({ id: `li-${i}`, ...v }))
    }
    return Array.isArray(values) ? values : [values]
  }

  const db: any = {
    select: (_cols?: unknown) => {
      const chain: any = { _table: null }
      chain.from = (t: unknown) => { chain._table = t; return chain }
      chain.innerJoin = () => chain
      chain.leftJoin = () => chain
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.groupBy = () => chain
      chain.limit = () => chain
      chain.then = (res: any, rej: any) => Promise.resolve(selectRows(chain._table)).then(res, rej)
      return chain
    },
    insert: (table: unknown) => ({
      values: (values: any) => {
        const rec = { table, values }
        return {
          returning: () => { inserts.push(rec); return Promise.resolve(insertReturning(table, values)) },
          then: (res: any, rej: any) => { inserts.push(rec); return Promise.resolve().then(res, rej) },
        }
      },
    }),
    update: (table: unknown) => ({
      set: (set: any) => {
        const rec = { table, set }
        const whereObj: any = {
          returning: () => { updates.push(rec); return Promise.resolve([{ id: 'inv-1', ...set }]) },
          then: (res: any, rej: any) => { updates.push(rec); return Promise.resolve().then(res, rej) },
        }
        return { where: () => whereObj }
      },
    }),
  }
  return { db, inserts, updates }
}

// A project in the workspace, billing a client with no email (→ Stripe skipped).
const projectRow = { id: 'p1', name: 'Launch', clientId: 'c1' }
const clientRow = { id: 'c1', name: 'Acme Co', contactEmail: null }
// Mixed entries: two billable+uninvoiced on t1, one on t2, plus a non-billable
// entry and an already-invoiced entry that must NOT roll up.
const entryRows = () => [
  { entryId: 'e1', durationSec: 3600, isBillable: true, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
  { entryId: 'e2', durationSec: 1800, isBillable: true, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
  { entryId: 'e3', durationSec: 7200, isBillable: false, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
  { entryId: 'e4', durationSec: 3600, isBillable: true, clientInvoiceId: 'old-inv', taskId: 't2', taskTitle: 'Build' },
  { entryId: 'e5', durationSec: 3600, isBillable: true, clientInvoiceId: null, taskId: 't2', taskTitle: 'Build' },
]

function selectFor(entries = entryRows()) {
  return (table: unknown) => {
    if (table === projects) return [projectRow]
    if (table === clients) return [clientRow]
    if (table === timeEntries) return entries
    return []
  }
}

describe('ClientInvoicingService.generateFromProject', () => {
  it('rolls up only billable + uninvoiced entries, groups by task, and totals correctly', async () => {
    const { db, inserts } = makeDb(selectFor())
    const svc = new ClientInvoicingService(db, null)

    const result = await svc.generateFromProject('ws-1', 'p1', { ratePerHourCents: 10_000 })

    // t1: 90 billed minutes → $150; t2: 60 minutes → $100; non-billable +
    // already-invoiced entries excluded.
    assert.equal(result.status, 'draft')
    assert.equal(result.subtotalCents, 25_000)
    assert.equal(result.totalCents, 25_000)
    assert.equal(result.lineItems.length, 2)

    const design = result.lineItems.find((l: any) => l.description === 'Design')!
    const build = result.lineItems.find((l: any) => l.description === 'Build')!
    assert.equal(design.quantityMinutes, 90)
    assert.equal(design.amountCents, 15_000)
    assert.equal(design.unitAmountCents, 10_000)
    assert.deepEqual(design.timeEntryIds, ['e1', 'e2'])
    assert.equal(build.quantityMinutes, 60)
    assert.equal(build.amountCents, 10_000)
    assert.deepEqual(build.timeEntryIds, ['e5'])

    // The persisted invoice carries the computed totals + draft status.
    const invInsert = inserts.find((i) => i.table === clientInvoices)!
    assert.equal(invInsert.values.status, 'draft')
    assert.equal(invInsert.values.subtotalCents, 25_000)
    assert.equal(invInsert.values.clientId, 'c1')
  })

  it('stamps every included time entry with the new invoice id (no double-invoicing)', async () => {
    const { db, updates } = makeDb(selectFor())
    const svc = new ClientInvoicingService(db, null)

    await svc.generateFromProject('ws-1', 'p1', {})

    const stamp = updates.find((u) => u.table === timeEntries)!
    assert.ok(stamp, 'time_entries should be stamped')
    assert.equal(stamp.set.clientInvoiceId, 'inv-1')
  })

  it('defaults the rate to $100/h when none is supplied', async () => {
    const { db } = makeDb(selectFor())
    const svc = new ClientInvoicingService(db, null)
    const result = await svc.generateFromProject('ws-1', 'p1', {})
    // 90 min + 60 min = 150 min = 2.5 h → $250 at the default rate.
    assert.equal(result.totalCents, 25_000)
  })

  it('rejects a project with no unbilled billable time', async () => {
    const onlyExcluded = [
      { entryId: 'e3', durationSec: 7200, isBillable: false, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
      { entryId: 'e4', durationSec: 3600, isBillable: true, clientInvoiceId: 'old-inv', taskId: 't2', taskTitle: 'Build' },
    ]
    const { db } = makeDb(selectFor(onlyExcluded))
    const svc = new ClientInvoicingService(db, null)
    await assert.rejects(() => svc.generateFromProject('ws-1', 'p1', {}), BadRequestException)
  })

  it('rejects a project with no client to bill', async () => {
    const { db } = makeDb((table) => (table === projects ? [{ id: 'p1', name: 'Launch', clientId: null }] : []))
    const svc = new ClientInvoicingService(db, null)
    await assert.rejects(() => svc.generateFromProject('ws-1', 'p1', {}), BadRequestException)
  })
})

describe('ClientInvoicingService — Stripe unconfigured', () => {
  it('stays a clean local draft (no Stripe fields, no Stripe mirror write)', async () => {
    const { db, updates } = makeDb(selectFor())
    const svc = new ClientInvoicingService(db, null) // null == STRIPE_SECRET_KEY unset

    const result = await svc.generateFromProject('ws-1', 'p1', {})

    assert.equal(result.status, 'draft')
    assert.ok(!result.stripeInvoiceId, 'no Stripe invoice id on the local draft')
    assert.ok(!result.hostedUrl, 'no hosted url on the local draft')
    // The only write to client_invoices is the initial insert — no Stripe mirror UPDATE.
    assert.equal(updates.filter((u) => u.table === clientInvoices).length, 0)
  })
})

describe('ClientInvoicingService.void', () => {
  it('voids the invoice and releases its time entries', async () => {
    const { db, updates } = makeDb((table) =>
      table === clientInvoices ? [{ id: 'inv-1', workspaceId: 'ws-1', status: 'draft' }] : [],
    )
    const svc = new ClientInvoicingService(db, null)

    const result = await svc.void('ws-1', 'inv-1')

    assert.equal(result.status, 'void')
    // Invoice moved to void…
    assert.ok(updates.some((u) => u.table === clientInvoices && u.set.status === 'void'))
    // …and its entries released (client_invoice_id cleared).
    const release = updates.find((u) => u.table === timeEntries)!
    assert.ok(release, 'time_entries should be released')
    assert.equal(release.set.clientInvoiceId, null)
  })
})

describe('ClientInvoicingService state transitions', () => {
  it('markSent flips status to sent and stamps issued_at', async () => {
    const { db, updates } = makeDb((table) =>
      table === clientInvoices ? [{ id: 'inv-1', workspaceId: 'ws-1', status: 'draft', issuedAt: null }] : [],
    )
    const svc = new ClientInvoicingService(db, null)

    const result = await svc.markSent('ws-1', 'inv-1')

    assert.equal(result.status, 'sent')
    const upd = updates.find((u) => u.table === clientInvoices)!
    assert.equal(upd.set.status, 'sent')
    assert.ok(upd.set.issuedAt instanceof Date)
  })

  it('get returns the invoice with its line items', async () => {
    const { db } = makeDb((table) => {
      if (table === clientInvoices) return [{ id: 'inv-1', workspaceId: 'ws-1', status: 'sent' }]
      if (table === clientInvoiceLineItems) return [{ id: 'li-0', invoiceId: 'inv-1', description: 'Design' }]
      return []
    })
    const svc = new ClientInvoicingService(db, null)

    const result = await svc.get('ws-1', 'inv-1')

    assert.equal(result.id, 'inv-1')
    assert.equal(result.lineItems.length, 1)
    assert.equal(result.lineItems[0].description, 'Design')
  })
})
