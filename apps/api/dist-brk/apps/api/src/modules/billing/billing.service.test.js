"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const db_1 = require("@rundesk/db");
const billing_service_1 = require("./billing.service");
/**
 * A drizzle-shaped fake DB that records writes and answers selects per table.
 * `selectRows(table)` returns rows for the current `.from(table)`; inserts and
 * updates are captured for assertions. No real Stripe or Postgres is touched.
 */
function makeDb(selectRows = () => []) {
    const inserts = [];
    const updates = [];
    const db = {
        select: (_cols) => {
            const chain = { _table: null };
            chain.from = (t) => { chain._table = t; return chain; };
            chain.innerJoin = () => chain;
            chain.leftJoin = () => chain;
            chain.where = () => chain;
            chain.orderBy = () => chain;
            chain.limit = () => chain;
            chain.then = (res, rej) => Promise.resolve(selectRows(chain._table)).then(res, rej);
            return chain;
        },
        insert: (table) => ({
            values: (values) => {
                const rec = { table, values, conflict: null };
                return {
                    onConflictDoUpdate: (conflict) => { rec.conflict = conflict; inserts.push(rec); return Promise.resolve(); },
                    then: (res, rej) => { inserts.push(rec); return Promise.resolve().then(res, rej); },
                };
            },
        }),
        update: (table) => ({
            set: (set) => ({ where: () => { updates.push({ table, set }); return Promise.resolve(); } }),
        }),
    };
    return { db, inserts, updates };
}
const CONFIGURED_ENV = {
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    STRIPE_PRICE_PRO: 'price_pro',
    STRIPE_PRICE_BUSINESS: 'price_biz',
    STRIPE_PRICE_ENTERPRISE: 'price_ent',
};
const cfg = (env) => ({ get: (k) => env[k] });
const plansMock = () => ({
    getWorkspacePlan: node_test_1.mock.fn(async () => ({ id: 'free', label: 'Free' })),
    setWorkspacePlan: node_test_1.mock.fn(async () => ({})),
});
/** A throwaway EmailService double (BillingService now emails paid invoices). */
const emailMock = () => ({ sendInvoicePaid: node_test_1.mock.fn(async () => { }) });
// --- not configured -----------------------------------------------------------
(0, node_test_1.describe)('BillingService — graceful degradation when NOT configured', () => {
    (0, node_test_1.it)('isConfigured() is false with no env and no client', () => {
        const { db } = makeDb();
        const svc = new billing_service_1.BillingService(db, cfg({}), plansMock(), null, emailMock());
        strict_1.default.equal(svc.isConfigured(), false);
    });
    (0, node_test_1.it)('checkout / portal / webhook all throw a clean 400 "not configured"', async () => {
        const { db } = makeDb();
        const svc = new billing_service_1.BillingService(db, cfg({}), plansMock(), null, emailMock());
        await strict_1.default.rejects(() => svc.createCheckoutSession('ws-1', 'pro'), common_1.BadRequestException);
        await strict_1.default.rejects(() => svc.createBillingPortalSession('ws-1'), common_1.BadRequestException);
        await strict_1.default.rejects(() => svc.handleWebhook(Buffer.from('{}'), 'sig'), common_1.BadRequestException);
    });
    (0, node_test_1.it)('getBillingStatus still answers with configured:false + the current plan', async () => {
        const { db } = makeDb(() => []);
        const svc = new billing_service_1.BillingService(db, cfg({}), plansMock(), null, emailMock());
        const status = await svc.getBillingStatus('ws-1');
        strict_1.default.equal(status.configured, false);
        strict_1.default.equal(status.plan.id, 'free');
        strict_1.default.equal(status.subscription, null);
        strict_1.default.deepEqual(status.invoices, []);
    });
});
// --- webhook signature verification -------------------------------------------
(0, node_test_1.describe)('BillingService.handleWebhook — signature verification', () => {
    (0, node_test_1.it)('rejects with 400 when constructEvent throws (bad signature)', async () => {
        const { db } = makeDb();
        const constructEvent = node_test_1.mock.fn((_payload, _sig, _secret) => {
            throw new Error('No signatures found matching the expected signature');
        });
        const stripe = { webhooks: { constructEvent } };
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock());
        await strict_1.default.rejects(() => svc.handleWebhook(Buffer.from('raw'), 'bad_sig'), /signature verification failed/);
        strict_1.default.equal(constructEvent.mock.callCount(), 1);
        // Verified against the RAW body + the webhook secret from env.
        const args = constructEvent.mock.calls[0].arguments;
        strict_1.default.equal(String(args[0]), 'raw');
        strict_1.default.equal(args[1], 'bad_sig');
        strict_1.default.equal(args[2], 'whsec_x');
    });
    (0, node_test_1.it)('dispatches the verified event (unknown type acknowledged, not handled)', async () => {
        const { db } = makeDb();
        const constructEvent = node_test_1.mock.fn(() => ({ type: 'ping', data: { object: {} } }));
        const stripe = { webhooks: { constructEvent } };
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock());
        const res = await svc.handleWebhook(Buffer.from('raw'), 'sig');
        strict_1.default.deepEqual(res, { received: true, type: 'ping', handled: false });
    });
});
// --- checkout.session.completed -----------------------------------------------
(0, node_test_1.describe)('BillingService — checkout.session.completed', () => {
    (0, node_test_1.it)('persists customer + subscription and syncs workspaces.plan to the tier', async () => {
        const { db, inserts } = makeDb();
        const plans = plansMock();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock());
        await svc.processEvent({
            type: 'checkout.session.completed',
            data: { object: { client_reference_id: 'ws-1', customer: 'cus_1', subscription: 'sub_1', metadata: { tier: 'pro' } } },
        });
        const customerInsert = inserts.find((i) => i.table === db_1.billingCustomers);
        const subInsert = inserts.find((i) => i.table === db_1.subscriptions);
        strict_1.default.ok(customerInsert, 'billing_customers upserted');
        strict_1.default.equal(customerInsert.values.stripeCustomerId, 'cus_1');
        strict_1.default.ok(subInsert, 'subscription upserted');
        strict_1.default.equal(subInsert.values.stripeSubscriptionId, 'sub_1');
        strict_1.default.equal(subInsert.values.tier, 'pro');
        strict_1.default.equal(subInsert.values.status, 'active');
        // Plan synced → the bridge to plan-based gating.
        strict_1.default.equal(plans.setWorkspacePlan.mock.callCount(), 1);
        strict_1.default.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'pro']);
    });
});
// --- customer.subscription.updated / deleted ----------------------------------
(0, node_test_1.describe)('BillingService — subscription lifecycle plan sync', () => {
    (0, node_test_1.it)('subscription.updated (active) syncs the plan to the price-derived tier', async () => {
        const { db, inserts } = makeDb();
        const plans = plansMock();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock());
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
        });
        const subInsert = inserts.find((i) => i.table === db_1.subscriptions);
        strict_1.default.equal(subInsert.values.tier, 'business');
        strict_1.default.equal(subInsert.values.status, 'active');
        strict_1.default.ok(subInsert.values.currentPeriodEnd instanceof Date);
        strict_1.default.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'business']);
    });
    (0, node_test_1.it)('subscription.deleted cancels the row and drops the plan back to free', async () => {
        const { db, updates } = makeDb();
        const plans = plansMock();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock());
        await svc.processEvent({
            type: 'customer.subscription.deleted',
            data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { workspaceId: 'ws-1' } } },
        });
        const subUpdate = updates.find((u) => u.table === db_1.subscriptions);
        strict_1.default.equal(subUpdate.set.status, 'canceled');
        strict_1.default.equal(subUpdate.set.cancelAtPeriodEnd, true);
        strict_1.default.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'free']);
    });
});
// --- invoice.payment_failed → dunning -----------------------------------------
(0, node_test_1.describe)('BillingService — invoice.payment_failed (dunning)', () => {
    function build() {
        // billing_customers lookup → ws-1; workspace_members admins → one admin.
        const { db, inserts, updates } = makeDb((table) => {
            if (table === db_1.billingCustomers)
                return [{ workspaceId: 'ws-1', stripeCustomerId: 'cus_1' }];
            if (table === db_1.workspaceMembers)
                return [{ userId: 'admin-1' }];
            return [];
        });
        return { db, inserts, updates };
    }
    (0, node_test_1.it)('non-final failure: past_due + admin notify, but NO downgrade', async () => {
        const { db, inserts, updates } = build();
        const plans = plansMock();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock());
        await svc.processEvent({
            type: 'invoice.payment_failed',
            data: { object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', currency: 'usd', amount_due: 2000, next_payment_attempt: 1893456000 } },
        });
        // subscription marked past_due
        const subUpdate = updates.find((u) => u.table === db_1.subscriptions);
        strict_1.default.equal(subUpdate.set.status, 'past_due');
        // failed invoice persisted
        const invInsert = inserts.find((i) => i.table === db_1.invoices);
        strict_1.default.equal(invInsert.values.stripeInvoiceId, 'in_1');
        strict_1.default.equal(invInsert.values.amount, 2000);
        // admin notification created (type billing_past_due)
        const notif = inserts.find((i) => i.table === db_1.notifications);
        strict_1.default.ok(notif, 'admins notified');
        strict_1.default.equal(notif.values[0].type, 'billing_past_due');
        strict_1.default.equal(notif.values[0].userId, 'admin-1');
        // NOT a final failure → plan unchanged
        strict_1.default.equal(plans.setWorkspacePlan.mock.callCount(), 0);
    });
    (0, node_test_1.it)('final failure (no retry scheduled): downgrades the plan to free', async () => {
        const { db, inserts } = build();
        const plans = plansMock();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock());
        await svc.processEvent({
            type: 'invoice.payment_failed',
            data: { object: { id: 'in_2', customer: 'cus_1', subscription: 'sub_1', currency: 'usd', amount_due: 2000, next_payment_attempt: null } },
        });
        strict_1.default.equal(plans.setWorkspacePlan.mock.callCount(), 1);
        strict_1.default.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'free']);
        // The final-failure notification is the "downgraded" copy.
        const notif = inserts.find((i) => i.table === db_1.notifications);
        strict_1.default.match(notif.values[0].title, /downgraded/i);
    });
});
// --- free trial → checkout trial_period_days (§14.1) --------------------------
(0, node_test_1.describe)('BillingService — free trial at checkout', () => {
    function checkoutStripe() {
        const create = node_test_1.mock.fn(async (_args) => ({ url: 'https://stripe.test/checkout' }));
        return { stripe: { checkout: { sessions: { create } } }, create };
    }
    (0, node_test_1.it)('passes subscription_data.trial_period_days for a tier with a trial (pro=14)', async () => {
        const { db } = makeDb(() => []); // no existing billing customer
        const { stripe, create } = checkoutStripe();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock());
        const res = await svc.createCheckoutSession('ws-1', 'pro');
        strict_1.default.equal(res.url, 'https://stripe.test/checkout');
        const arg = create.mock.calls[0].arguments[0];
        strict_1.default.equal(arg.mode, 'subscription');
        strict_1.default.equal(arg.subscription_data.trial_period_days, 14);
        strict_1.default.deepEqual(arg.subscription_data.metadata, { workspaceId: 'ws-1', tier: 'pro' });
    });
    (0, node_test_1.it)('business also gets a 14-day trial', async () => {
        const { db } = makeDb(() => []);
        const { stripe, create } = checkoutStripe();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock());
        await svc.createCheckoutSession('ws-1', 'business');
        strict_1.default.equal(create.mock.calls[0].arguments[0].subscription_data.trial_period_days, 14);
    });
    (0, node_test_1.it)('omits trial_period_days for a tier without a trial (enterprise=0)', async () => {
        const { db } = makeDb(() => []);
        const { stripe, create } = checkoutStripe();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), stripe, emailMock());
        await svc.createCheckoutSession('ws-1', 'enterprise');
        const arg = create.mock.calls[0].arguments[0];
        strict_1.default.equal('trial_period_days' in arg.subscription_data, false);
    });
    (0, node_test_1.it)('is a clean no-op (400) when Stripe is not configured', async () => {
        const { db } = makeDb(() => []);
        const svc = new billing_service_1.BillingService(db, cfg({}), plansMock(), null, emailMock());
        await strict_1.default.rejects(() => svc.createCheckoutSession('ws-1', 'pro'), common_1.BadRequestException);
    });
});
// --- trial subscription lifecycle plan sync (§14.1) ---------------------------
(0, node_test_1.describe)('BillingService — trial subscription plan sync', () => {
    const subEvent = (status) => ({
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
    });
    (0, node_test_1.it)('status=trialing GRANTS the tier (trial is a granting status)', async () => {
        const { db } = makeDb();
        const plans = plansMock();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock());
        await svc.processEvent(subEvent('trialing'));
        strict_1.default.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'pro']);
    });
    (0, node_test_1.it)('status=unpaid after the trial REVOKES to free (auto-downgrade)', async () => {
        const { db } = makeDb();
        const plans = plansMock();
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plans, null, emailMock());
        await svc.processEvent(subEvent('unpaid'));
        strict_1.default.deepEqual(plans.setWorkspacePlan.mock.calls[0].arguments, ['ws-1', 'free']);
    });
});
// --- app-side invoice PDF + email, idempotent (§14.1) -------------------------
(0, node_test_1.describe)('BillingService — invoice.paid emails a branded PDF (idempotent)', () => {
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
    };
    (0, node_test_1.it)('renders a PDF + emails the billing contacts once, then no-ops on the duplicate event', async () => {
        // Mutable so we can flip the mirror to "already paid" between the two events.
        let invoiceRows = [];
        const { db } = makeDb((table) => {
            if (table === db_1.invoices)
                return invoiceRows;
            if (table === db_1.workspaceMembers)
                return [{ email: 'Admin@Acme.test' }];
            if (table === db_1.workspaces)
                return [{ name: 'Acme Inc' }];
            return [];
        });
        const email = { sendInvoicePaid: node_test_1.mock.fn(async () => { }) };
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), null, email);
        // First paid event → email sent exactly once.
        await svc.processEvent({ type: 'invoice.paid', data: { object: paidInvoice } });
        strict_1.default.equal(email.sendInvoicePaid.mock.callCount(), 1);
        const arg = email.sendInvoicePaid.mock.calls[0].arguments[0];
        strict_1.default.match(arg.to, /admin@acme\.test/); // admin email, normalized + deduped
        strict_1.default.match(arg.to, /owner@acme\.test/); // + the Stripe customer_email
        strict_1.default.equal(arg.invoiceNumber, 'RD-0001');
        strict_1.default.equal(arg.amountLabel, '$20.00');
        strict_1.default.equal(arg.workspaceName, 'Acme Inc');
        strict_1.default.ok(Buffer.isBuffer(arg.pdf), 'a PDF Buffer is attached');
        strict_1.default.equal(arg.pdf.subarray(0, 4).toString('latin1'), '%PDF');
        // Stripe re-delivers as invoice.payment_succeeded; mirror now shows paid.
        invoiceRows = [{ status: 'paid' }];
        await svc.processEvent({ type: 'invoice.payment_succeeded', data: { object: paidInvoice } });
        strict_1.default.equal(email.sendInvoicePaid.mock.callCount(), 1); // NOT emailed twice
    });
    (0, node_test_1.it)('still persists the invoice row on the paid event', async () => {
        const { db, inserts } = makeDb((table) => {
            if (table === db_1.invoices)
                return [];
            if (table === db_1.workspaceMembers)
                return [{ email: 'admin@acme.test' }];
            if (table === db_1.workspaces)
                return [{ name: 'Acme Inc' }];
            return [];
        });
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), null, emailMock());
        await svc.processEvent({ type: 'invoice.paid', data: { object: paidInvoice } });
        const invInsert = inserts.find((i) => i.table === db_1.invoices);
        strict_1.default.ok(invInsert, 'invoice mirrored');
        strict_1.default.equal(invInsert.values.stripeInvoiceId, 'in_paid_1');
        strict_1.default.equal(invInsert.values.status, 'paid');
    });
    (0, node_test_1.it)('a mail failure never fails the webhook (best-effort)', async () => {
        const { db } = makeDb((table) => {
            if (table === db_1.invoices)
                return [];
            if (table === db_1.workspaceMembers)
                return [{ email: 'admin@acme.test' }];
            if (table === db_1.workspaces)
                return [{ name: 'Acme Inc' }];
            return [];
        });
        const email = { sendInvoicePaid: node_test_1.mock.fn(async () => { throw new Error('smtp down'); }) };
        const svc = new billing_service_1.BillingService(db, cfg(CONFIGURED_ENV), plansMock(), null, email);
        const res = await svc.processEvent({ type: 'invoice.paid', data: { object: paidInvoice } });
        strict_1.default.deepEqual(res, { received: true, type: 'invoice.paid', handled: true });
    });
});
//# sourceMappingURL=billing.service.test.js.map