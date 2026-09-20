"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoicesRelations = exports.subscriptionsRelations = exports.billingCustomersRelations = exports.invoices = exports.subscriptions = exports.billingCustomers = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
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
exports.billingCustomers = (0, pg_core_1.pgTable)('billing_customers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    stripeCustomerId: (0, pg_core_1.text)('stripe_customer_id').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqueWorkspace: (0, pg_core_1.unique)('uq_billing_customers_workspace').on(t.workspaceId),
    uniqueCustomer: (0, pg_core_1.unique)('uq_billing_customers_stripe_customer').on(t.stripeCustomerId),
}));
/**
 * The workspace's current Stripe subscription. `tier` is the resolved plan id
 * (free/pro/business/enterprise) mapped from the Stripe price; `status` mirrors
 * Stripe (active, trialing, past_due, canceled, …). One active subscription per
 * workspace is expected, but the row is keyed by the Stripe subscription id so a
 * re-subscribe upserts cleanly.
 */
exports.subscriptions = (0, pg_core_1.pgTable)('subscriptions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: (0, pg_core_1.text)('stripe_subscription_id').notNull(),
    status: (0, pg_core_1.text)('status').notNull(),
    // The plan tier this subscription entitles (mirrors workspaces.plan).
    tier: (0, pg_core_1.text)('tier').notNull(),
    currentPeriodEnd: (0, pg_core_1.timestamp)('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: (0, pg_core_1.boolean)('cancel_at_period_end').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('subscriptions_workspace_idx').on(t.workspaceId),
    uniqueStripeSub: (0, pg_core_1.unique)('uq_subscriptions_stripe_subscription').on(t.stripeSubscriptionId),
}));
/** A persisted Stripe invoice (for the billing history UI + payment records). */
exports.invoices = (0, pg_core_1.pgTable)('invoices', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    stripeInvoiceId: (0, pg_core_1.text)('stripe_invoice_id').notNull(),
    // Amount in the currency's minor unit (cents), as Stripe reports it.
    amount: (0, pg_core_1.integer)('amount').notNull().default(0),
    currency: (0, pg_core_1.text)('currency').notNull().default('usd'),
    status: (0, pg_core_1.text)('status').notNull(),
    hostedUrl: (0, pg_core_1.text)('hosted_url'),
    pdfUrl: (0, pg_core_1.text)('pdf_url'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('invoices_workspace_idx').on(t.workspaceId),
    uniqueStripeInv: (0, pg_core_1.unique)('uq_invoices_stripe_invoice').on(t.stripeInvoiceId),
}));
exports.billingCustomersRelations = (0, drizzle_orm_1.relations)(exports.billingCustomers, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.billingCustomers.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
exports.subscriptionsRelations = (0, drizzle_orm_1.relations)(exports.subscriptions, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.subscriptions.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
exports.invoicesRelations = (0, drizzle_orm_1.relations)(exports.invoices, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.invoices.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=billing.js.map