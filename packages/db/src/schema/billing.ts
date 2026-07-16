import { pgTable, text, timestamp, uuid, integer, boolean, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'

/**
 * Stripe billing (Plan §14.1). These three tables are the local mirror of the
 * commercial subscription state that Stripe owns. They are written ONLY from the
 * Stripe webhook handler (checkout.session.completed, customer.subscription.*,
 * invoice.*), so Stripe stays the source of truth and the app reads a fast,
 * queryable local copy for the billing UI.
 *
 * Everything here is additive + env-gated: with no Stripe keys configured the
 * tables simply stay empty and every billing endpoint degrades to a clean
 * "billing not configured" response. The workspace's entitlement itself lives on
 * `workspaces.plan` (see PlansService) — the webhook syncs that column from the
 * subscription tier, which is the bridge between Stripe and plan-based gating.
 */

/** One Stripe Customer per workspace (unique). */
export const billingCustomers = pgTable(
  'billing_customers',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    workspaceId:      uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueWorkspace:  unique('uq_billing_customers_workspace').on(t.workspaceId),
    uniqueCustomer:   unique('uq_billing_customers_stripe_customer').on(t.stripeCustomerId),
  }),
)

/**
 * The workspace's current Stripe subscription. `tier` is the resolved plan id
 * (free/pro/business/enterprise) mapped from the Stripe price; `status` mirrors
 * Stripe (active, trialing, past_due, canceled, …). One active subscription per
 * workspace is expected, but the row is keyed by the Stripe subscription id so a
 * re-subscribe upserts cleanly.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id:                   uuid('id').primaryKey().defaultRandom(),
    workspaceId:          uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    status:               text('status').notNull(),
    // The plan tier this subscription entitles (mirrors workspaces.plan).
    tier:                 text('tier').notNull(),
    currentPeriodEnd:     timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd:    boolean('cancel_at_period_end').notNull().default(false),
    createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace:      index('subscriptions_workspace_idx').on(t.workspaceId),
    uniqueStripeSub:  unique('uq_subscriptions_stripe_subscription').on(t.stripeSubscriptionId),
  }),
)

/** A persisted Stripe invoice (for the billing history UI + payment records). */
export const invoices = pgTable(
  'invoices',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    workspaceId:     uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    stripeInvoiceId: text('stripe_invoice_id').notNull(),
    // Amount in the currency's minor unit (cents), as Stripe reports it.
    amount:          integer('amount').notNull().default(0),
    currency:        text('currency').notNull().default('usd'),
    status:          text('status').notNull(),
    hostedUrl:       text('hosted_url'),
    pdfUrl:          text('pdf_url'),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace:      index('invoices_workspace_idx').on(t.workspaceId),
    uniqueStripeInv:  unique('uq_invoices_stripe_invoice').on(t.stripeInvoiceId),
  }),
)

export const billingCustomersRelations = relations(billingCustomers, ({ one }) => ({
  workspace: one(workspaces, { fields: [billingCustomers.workspaceId], references: [workspaces.id] }),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(workspaces, { fields: [subscriptions.workspaceId], references: [workspaces.id] }),
}))

export const invoicesRelations = relations(invoices, ({ one }) => ({
  workspace: one(workspaces, { fields: [invoices.workspaceId], references: [workspaces.id] }),
}))
