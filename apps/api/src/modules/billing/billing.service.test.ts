import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { billingCustomers, subscriptions, invoices, workspaces, workspaceMembers, notifications } from '@rundesk/db'
import { BillingService } from './billing.service'

/**
 * A drizzle-shaped fake DB that records writes and answers selects per table.
 * `selectRows(table)` returns rows for the current `.from(table)`; inserts and
 * updates are captured for assertions. No real Stripe or Postgres is touched.
 */
function makeDb(selectRows: (table: unknown) => any[] = () => []) {
  const inserts: Array<{ table: unknown; values: any; conflict: any }> = []
  const updates: Array<{ table: unknown; set: any }> = []
  const db: any = {
    select: (_cols?: unknown) => {
      const chain: any = { _table: null }
      chain.from = (t: unknown) => { chain._table = t; return chain }
      chain.innerJoin = () => chain
      chain.leftJoin = () => chain
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.limit = () => chain
      chain.then = (res: any, rej: any) => Promise.resolve(selectRows(chain._table)).then(res, rej)
      return chain
    },
    insert: (table: unknown) => ({
      values: (values: any) => {
        const rec = { table, values, conflict: null as any }
        return {
          onConflictDoUpdate: (conflict: any) => { rec.conflict = conflict; inserts.push(rec); return Promise.resolve() },
          then: (res: any, rej: any) => { inserts.push(rec); return Promise.resolve().then(res, rej) },
        }
      },
    }),
    update: (table: unknown) => ({
      set: (set: any) => ({ where: () => { updates.push({ table, set }); return Promise.resolve() } }),
    }),
  }
  return { db, inserts, updates }
}

const CONFIGURED_ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_BUSINESS: 'price_biz',
  STRIPE_PRICE_ENTERPRISE: 'price_ent',
}
const cfg = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] }) as any
const plansMock = () => ({
  getWorkspacePlan: mock.fn(async () => ({ id: 'free', label: 'Free' })),
  setWorkspacePlan: mock.fn(async () => ({})),
}) as any
/** A throwaway EmailService double (BillingService now emails paid invoices). */
const emailMock = () => ({ sendInvoicePaid: mock.fn(async () => {}) }) as any

// --- not configured -----------------------------------------------------------
describe('BillingService — graceful degradation when NOT configured', () => {
  it('isConfigured() is false with no env and no client', () => {
    const { db } = makeDb()
    const svc = new BillingService(db, cfg({}), plansMock(), null, emailMock())
    assert.equal(svc.isConfigured(), false)
  })

  it('checkout / portal / webhook all throw a clean 400 "not configured"', async () => {
    const { db } = makeDb()
    const svc = new BillingService(db, cfg({}), plansMock(), null, emailMock())
    await assert.rejects(() => svc.createCheckoutSession('ws-1', 'pro'), BadRequestException)
    await assert.rejects(() => svc.createBillingPortalSession('ws-1'), BadRequestException)
    await assert.rejects(() => svc.handleWebhook(Buffer.from('{}'), 'sig'), BadRequestException)
  })

  it('getBillingStatus still answers with configured:false + the current plan', async () => {
    const { db } = makeDb(() => [])
    const svc = new BillingService(db, cfg({}), plansMock(), null, emailMock())
    const status = await svc.getBillingStatus('ws-1')
    assert.equal(status.configured, false)
    assert.equal(status.plan.id, 'free')
    assert.equal(status.subscription, null)
    assert.deepEqual(status.invoices, [])
  })
})

// --- webhook signature verification -------------------------------------------
describe('BillingService.handleWebhook — signature verification', () => {
  it('rejects with 400 when constructEvent throws (bad signature)', async () => {
    const { db } = makeDb()
    const constructEvent = mock.fn((_payload: unknown, _sig: unknown, _secret: unknown) => {
      throw new Error('No signatures found matching the expected signature')
    })
    const stripe = { webhooks: { constructEvent } } as any
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock())
    await assert.rejects(() => svc.handleWebhook(Buffer.from('raw'), 'bad_sig'), /signature verification failed/)
    assert.equal(constructEvent.mock.callCount(), 1)
    // Verified against the RAW body + the webhook secret from env.
    const args = constructEvent.mock.calls[0].arguments
    assert.equal(String(args[0]), 'raw')
    assert.equal(args[1], 'bad_sig')
    assert.equal(args[2], 'whsec_x')
  })

  it('dispatches the verified event (unknown type acknowledged, not handled)', async () => {
    const { db } = makeDb()
    const constructEvent = mock.fn(() => ({ type: 'ping', data: { object: {} } }))
    const stripe = { webhooks: { constructEvent } } as any
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock())
    const res = await svc.handleWebhook(Buffer.from('raw'), 'sig')
    assert.deepEqual(res, { received: true, type: 'ping', handled: false })
  })
})

// --- checkout.session.completed -----------------------------------------------
describe('BillingService — checkout.session.completed', () => {
  it('persists customer + subscription and syncs workspaces.plan to the tier', async () => {
    const { db, inserts } = makeDb()
    const plans = plansMock()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock())
    await svc.processEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'ws-1', customer: 'cus_1', subscription: 'sub_1', metadata: { tier: 'pro' } } },
    })
    const customerInsert = inserts.find((i) => i.table === billingCustomers)
    const subInsert = inserts.find((i) => i.table === subscriptions)
    assert.ok(customerInsert, 'billing_customers upserted')
    assert.equal(customerInsert!.values.stripeCustomerId, 'cus_1')
    assert.ok(subInsert, 'subscription upserted')
    assert.equal(subInsert!.values.stripeSubscriptionId, 'sub_1')
    assert.equal(subInsert!.values.tier, 'pro')
    assert.equal(subInsert!.values.status, 'active')
    // Plan synced → the bridge to plan-based gating.
    assert.equal(plans.setWorkspacePlan.mock.callCount(), 1)
    assert.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'pro'])
  })
})

// --- customer.subscription.updated / deleted ----------------------------------
describe('BillingService — subscription lifecycle plan sync', () => {
  it('subscription.updated (active) syncs the plan to the price-derived tier', async () => {
    const { db, inserts } = makeDb()
    const plans = plansMock()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock())
    await svc.processEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          customer: 'cus_1',
          cancel_at_period_end: false,
          metadata: { workspaceId: 'ws-1' },
          items: { data: [{ price: { id: 'price_biz' }, current_period_end: 1893456000 }] },
        },
      },
    })
    const subInsert = inserts.find((i) => i.table === subscriptions)
    assert.equal(subInsert!.values.tier, 'business')
    assert.equal(subInsert!.values.status, 'active')
    assert.ok(subInsert!.values.currentPeriodEnd instanceof Date)
    assert.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'business'])
  })

  it('subscription.deleted cancels the row and drops the plan back to free', async () => {
    const { db, updates } = makeDb()
    const plans = plansMock()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock())
    await svc.processEvent({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { workspaceId: 'ws-1' } } },
    })
    const subUpdate = updates.find((u) => u.table === subscriptions)
    assert.equal(subUpdate!.set.status, 'canceled')
    assert.equal(subUpdate!.set.cancelAtPeriodEnd, true)
    assert.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'free'])
  })
})

// --- invoice.payment_failed → dunning -----------------------------------------
describe('BillingService — invoice.payment_failed (dunning)', () => {
  function build() {
    // billing_customers lookup → ws-1; workspace_members admins → one admin.
    const { db, inserts, updates } = makeDb((table) => {
      if (table === billingCustomers) return [{ workspaceId: 'ws-1', stripeCustomerId: 'cus_1' }]
      if (table === workspaceMembers) return [{ userId: 'admin-1' }]
      return []
    })
    return { db, inserts, updates }
  }

  it('non-final failure: past_due + admin notify, but NO downgrade', async () => {
    const { db, inserts, updates } = build()
    const plans = plansMock()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock())
    await svc.processEvent({
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', currency: 'usd', amount_due: 2000, next_payment_attempt: 1893456000 } },
    })
    // subscription marked past_due
    const subUpdate = updates.find((u) => u.table === subscriptions)
    assert.equal(subUpdate!.set.status, 'past_due')
    // failed invoice persisted
    const invInsert = inserts.find((i) => i.table === invoices)
    assert.equal(invInsert!.values.stripeInvoiceId, 'in_1')
    assert.equal(invInsert!.values.amount, 2000)
    // admin notification created (type billing_past_due)
    const notif = inserts.find((i) => i.table === notifications)
    assert.ok(notif, 'admins notified')
    assert.equal(notif!.values[0].type, 'billing_past_due')
    assert.equal(notif!.values[0].userId, 'admin-1')
    // NOT a final failure → plan unchanged
    assert.equal(plans.setWorkspacePlan.mock.callCount(), 0)
  })

  it('final failure (no retry scheduled): downgrades the plan to free', async () => {
    const { db, inserts } = build()
    const plans = plansMock()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock())
    await svc.processEvent({
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_2', customer: 'cus_1', subscription: 'sub_1', currency: 'usd', amount_due: 2000, next_payment_attempt: null } },
    })
    assert.equal(plans.setWorkspacePlan.mock.callCount(), 1)
    assert.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'free'])
    // The final-failure notification is the "downgraded" copy.
    const notif = inserts.find((i) => i.table === notifications)
    assert.match(notif!.values[0].title, /downgraded/i)
  })
})

// --- free trial → checkout trial_period_days (§14.1) --------------------------
describe('BillingService — free trial at checkout', () => {
  function checkoutStripe() {
    const create = mock.fn(async (_args: any) => ({ url: 'https://stripe.test/checkout' }))
    return { stripe: { checkout: { sessions: { create } } } as any, create }
  }

  it('passes subscription_data.trial_period_days for a tier with a trial (pro=14)', async () => {
    const { db } = makeDb(() => []) // no existing billing customer
    const { stripe, create } = checkoutStripe()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock())
    const res = await svc.createCheckoutSession('ws-1', 'pro')
    assert.equal(res.url, 'https://stripe.test/checkout')
    const arg = create.mock.calls[0].arguments[0]
    assert.equal(arg.mode, 'subscription')
    assert.equal(arg.subscription_data.trial_period_days, 14)
    assert.deepEqual(arg.subscription_data.metadata, { workspaceId: 'ws-1', tier: 'pro' })
  })

  it('business also gets a 14-day trial', async () => {
    const { db } = makeDb(() => [])
    const { stripe, create } = checkoutStripe()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock())
    await svc.createCheckoutSession('ws-1', 'business')
    assert.equal(create.mock.calls[0].arguments[0].subscription_data.trial_period_days, 14)
  })

  it('omits trial_period_days for a tier without a trial (enterprise=0)', async () => {
    const { db } = makeDb(() => [])
    const { stripe, create } = checkoutStripe()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock())
    await svc.createCheckoutSession('ws-1', 'enterprise')
    const arg = create.mock.calls[0].arguments[0]
    assert.equal('trial_period_days' in arg.subscription_data, false)
  })

  it('is a clean no-op (400) when Stripe is not configured', async () => {
    const { db } = makeDb(() => [])
    const svc = new BillingService(db, cfg({}), plansMock(), null, emailMock())
    await assert.rejects(() => svc.createCheckoutSession('ws-1', 'pro'), BadRequestException)
  })
})

// --- trial subscription lifecycle plan sync (§14.1) ---------------------------
describe('BillingService — trial subscription plan sync', () => {
  const subEvent = (status: string) => ({
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_t',
        status,
        customer: 'cus_1',
        cancel_at_period_end: false,
        metadata: { workspaceId: 'ws-1', tier: 'pro' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      },
    },
  })

  it('status=trialing GRANTS the tier (trial is a granting status)', async () => {
    const { db } = makeDb()
    const plans = plansMock()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock())
    await svc.processEvent(subEvent('trialing'))
    assert.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'pro'])
  })

  it('status=unpaid after the trial REVOKES to free (auto-downgrade)', async () => {
    const { db } = makeDb()
    const plans = plansMock()
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock())
    await svc.processEvent(subEvent('unpaid'))
    assert.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'free'])
  })
})

// --- app-side invoice PDF + email, idempotent (§14.1) -------------------------
describe('BillingService — invoice.paid emails a branded PDF (idempotent)', () => {
  const paidInvoice = {
    id: 'in_paid_1',
    number: 'RD-0001',
    status: 'paid',
    currency: 'usd',
    amount_paid: 2000,
    created: 1893456000,
    customer: 'cus_1',
    customer_email: 'owner@acme.test',
    metadata: { workspaceId: 'ws-1' },
    lines: { data: [{ description: 'Pro plan (monthly)', amount: 2000 }] },
  }

  it('renders a PDF + emails the billing contacts once, then no-ops on the duplicate event', async () => {
    // Mutable so we can flip the mirror to "already paid" between the two events.
    let invoiceRows: any[] = []
    const { db } = makeDb((table) => {
      if (table === invoices) return invoiceRows
      if (table === workspaceMembers) return [{ email: 'Admin@Acme.test' }]
      if (table === workspaces) return [{ name: 'Acme Inc' }]
      return []
    })
    const email = { sendInvoicePaid: mock.fn(async () => {}) } as any
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), null, email)

    // First paid event → email sent exactly once.
    await svc.processEvent({ type: 'invoice.paid', data: { object: paidInvoice } })
    assert.equal(email.sendInvoicePaid.mock.callCount(), 1)
    const arg = email.sendInvoicePaid.mock.calls[0].arguments[0]
    assert.match(arg.to, /admin@acme\.test/) // admin email, normalized + deduped
    assert.match(arg.to, /owner@acme\.test/) // + the Stripe customer_email
    assert.equal(arg.invoiceNumber, 'RD-0001')
    assert.equal(arg.amountLabel, '$20.00')
    assert.equal(arg.workspaceName, 'Acme Inc')
    assert.ok(Buffer.isBuffer(arg.pdf), 'a PDF Buffer is attached')
    assert.equal(arg.pdf.subarray(0, 4).toString('latin1'), '%PDF')

    // Stripe re-delivers as invoice.payment_succeeded; mirror now shows paid.
    invoiceRows = [{ status: 'paid' }]
    await svc.processEvent({ type: 'invoice.payment_succeeded', data: { object: paidInvoice } })
    assert.equal(email.sendInvoicePaid.mock.callCount(), 1) // NOT emailed twice
  })

  it('still persists the invoice row on the paid event', async () => {
    const { db, inserts } = makeDb((table) => {
      if (table === invoices) return []
      if (table === workspaceMembers) return [{ email: 'admin@acme.test' }]
      if (table === workspaces) return [{ name: 'Acme Inc' }]
      return []
    })
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), null, emailMock())
    await svc.processEvent({ type: 'invoice.paid', data: { object: paidInvoice } })
    const invInsert = inserts.find((i) => i.table === invoices)
    assert.ok(invInsert, 'invoice mirrored')
    assert.equal(invInsert!.values.stripeInvoiceId, 'in_paid_1')
    assert.equal(invInsert!.values.status, 'paid')
  })

  it('a mail failure never fails the webhook (best-effort)', async () => {
    const { db } = makeDb((table) => {
      if (table === invoices) return []
      if (table === workspaceMembers) return [{ email: 'admin@acme.test' }]
      if (table === workspaces) return [{ name: 'Acme Inc' }]
      return []
    })
    const email = { sendInvoicePaid: mock.fn(async () => { throw new Error('smtp down') }) } as any
    const svc = new BillingService(db, cfg(CONFIGURED_ENV), plansMock(), null, email)
    const res = await svc.processEvent({ type: 'invoice.paid', data: { object: paidInvoice } })
    assert.deepEqual(res, { received: true, type: 'invoice.paid', handled: true })
  })
})
