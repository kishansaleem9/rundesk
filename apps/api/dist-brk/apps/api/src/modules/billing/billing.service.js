"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BillingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const plans_service_1 = require("../plans/plans.service");
const plans_constants_1 = require("../plans/plans.constants");
const email_service_1 = require("../email/email.service");
const stripe_provider_1 = require("./stripe.provider");
const invoice_pdf_1 = require("./invoice-pdf");
const billing_constants_1 = require("./billing.constants");
/**
 * Stripe subscription statuses that entitle the workspace to its paid tier.
 * `trialing` is included so a free trial (§14.1) grants the tier for its
 * duration; when the trial ends the status moves to `active` (paid) or, if the
 * charge fails, to `past_due` → `unpaid`/`canceled` (revoked below).
 */
const GRANTING_STATUSES = new Set(['active', 'trialing', 'past_due']);
/**
 * Statuses that revoke entitlement → the workspace drops back to free. This is
 * also the trial-expiry-unpaid path: a trial that ends without a successful
 * payment lands here (`unpaid`/`canceled`) and downgrades the workspace.
 */
const REVOKING_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);
/**
 * BillingService (Plan §14.1) — the complete Stripe integration: Checkout for
 * new subscriptions, the Billing Portal for self-serve upgrade/downgrade/cancel,
 * and a signature-verified webhook that keeps the local mirror
 * (billing_customers / subscriptions / invoices) and — critically —
 * `workspaces.plan` in sync with Stripe. Dunning (failed payments) marks the
 * subscription past_due, notifies workspace admins, and on the final failed
 * attempt downgrades the plan to free.
 *
 * Everything is env-gated: with no Stripe keys the Stripe client is null and
 * every entry point returns a clean "billing not configured" error, while
 * getBillingStatus still answers with `configured: false`.
 */
let BillingService = BillingService_1 = class BillingService {
    constructor(db, config, plans, stripe, email) {
        this.db = db;
        this.config = config;
        this.plans = plans;
        this.stripe = stripe;
        this.email = email;
        this.logger = new common_1.Logger(BillingService_1.name);
    }
    billingConfig() {
        return (0, billing_constants_1.readBillingConfig)((k) => this.config.get(k));
    }
    /** True when STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are set and a client exists. */
    isConfigured() {
        return Boolean(this.stripe) && (0, billing_constants_1.isBillingConfigured)(this.billingConfig());
    }
    requireStripe() {
        if (!this.isConfigured() || !this.stripe) {
            throw new common_1.BadRequestException('Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable it.');
        }
        return this.stripe;
    }
    appUrl() {
        return this.config.get('APP_URL') ?? 'http://localhost:5173';
    }
    // ---------------------------------------------------------------------------
    // Checkout / Portal (customer-facing, super-admin/owner gated in the controller)
    // ---------------------------------------------------------------------------
    /**
     * Create a Stripe Checkout session for `tier` and return its hosted URL. The
     * workspace id rides along as client_reference_id + metadata so the
     * checkout.session.completed webhook can attribute the subscription.
     */
    async createCheckoutSession(workspaceId, tier) {
        const stripe = this.requireStripe();
        if (!(0, billing_constants_1.isPurchasableTier)(tier)) {
            throw new common_1.BadRequestException(`Unknown billing tier '${tier}'. Must be one of: pro, business, enterprise`);
        }
        const priceId = (0, billing_constants_1.priceIdForTier)(this.billingConfig(), tier);
        if (!priceId) {
            throw new common_1.BadRequestException(`Stripe price for the ${tier} plan is not configured (STRIPE_PRICE_${tier.toUpperCase()}).`);
        }
        const existingCustomerId = await this.getCustomerId(workspaceId);
        const appUrl = this.appUrl();
        // Free trial (§14.1): offer the tier's configured trial when it has one
        // (pro/business = 14 days; free/enterprise = 0 = no trial). Stripe creates a
        // `trialing` subscription — a granting status — and only charges when the
        // trial ends; if that charge fails the dunning path downgrades to free.
        const trialDays = (0, plans_constants_1.trialDaysForPlan)(tier);
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${appUrl}/app/${workspaceId}/settings?billing=success`,
            cancel_url: `${appUrl}/app/${workspaceId}/settings?billing=cancelled`,
            client_reference_id: workspaceId,
            ...(existingCustomerId ? { customer: existingCustomerId } : {}),
            metadata: { workspaceId, tier },
            subscription_data: {
                metadata: { workspaceId, tier },
                ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
            },
        });
        if (!session.url)
            throw new common_1.BadRequestException('Stripe did not return a checkout URL');
        return { url: session.url };
    }
    /**
     * Create a Stripe Billing Portal session (Stripe hosts the manage / upgrade /
     * downgrade / cancel UI). Requires an existing Stripe customer for the
     * workspace — i.e. at least one prior subscription.
     */
    async createBillingPortalSession(workspaceId) {
        const stripe = this.requireStripe();
        const customerId = await this.getCustomerId(workspaceId);
        if (!customerId) {
            throw new common_1.BadRequestException('No billing customer for this workspace yet. Start a subscription first.');
        }
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${this.appUrl()}/app/${workspaceId}/settings`,
        });
        return { url: session.url };
    }
    /** { configured, plan, subscription?, invoices[] } for the billing UI. */
    async getBillingStatus(workspaceId) {
        const plan = await this.plans.getWorkspacePlan(workspaceId);
        const [subscription] = await this.db
            .select()
            .from(db_1.subscriptions)
            .where((0, drizzle_orm_1.eq)(db_1.subscriptions.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.subscriptions.createdAt))
            .limit(1);
        const invoiceRows = await this.db
            .select()
            .from(db_1.invoices)
            .where((0, drizzle_orm_1.eq)(db_1.invoices.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.invoices.createdAt))
            .limit(20);
        return {
            configured: this.isConfigured(),
            plan: { id: plan.id, label: plan.label },
            subscription: subscription ?? null,
            invoices: invoiceRows,
        };
    }
    // ---------------------------------------------------------------------------
    // Webhook
    // ---------------------------------------------------------------------------
    /**
     * Verify the Stripe signature against STRIPE_WEBHOOK_SECRET, then dispatch.
     * The RAW request body (not the JSON-parsed object) is required for the HMAC
     * to match — see BillingWebhookController for how the raw body is obtained.
     */
    async handleWebhook(rawBody, signature) {
        const stripe = this.requireStripe();
        const secret = this.billingConfig().webhookSecret;
        if (!secret)
            throw new common_1.BadRequestException('Billing is not configured');
        if (!signature)
            throw new common_1.BadRequestException('Missing Stripe-Signature header');
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, secret);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'signature verification failed';
            throw new common_1.BadRequestException(`Webhook signature verification failed: ${message}`);
        }
        return this.processEvent(event);
    }
    /**
     * Dispatch a (already-verified) Stripe event. Public so it can be driven
     * directly in tests / verification without a valid signature. Unknown event
     * types are acknowledged and ignored.
     */
    async processEvent(event) {
        let handled = true;
        switch (event.type) {
            case 'checkout.session.completed':
                await this.onCheckoutCompleted(event.data.object);
                break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await this.onSubscriptionUpserted(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.onSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.paid':
            case 'invoice.payment_succeeded':
                await this.onInvoicePaid(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.onInvoicePaymentFailed(event.data.object);
                break;
            default:
                handled = false;
        }
        return { received: true, type: event.type, handled };
    }
    // ---------------------------------------------------------------------------
    // Webhook handlers
    // ---------------------------------------------------------------------------
    /**
     * checkout.session.completed — the customer finished paying. Persist the
     * Stripe customer + a subscription row and sync workspaces.plan to the tier.
     * Full period/price details arrive right after via customer.subscription.*.
     */
    async onCheckoutCompleted(session) {
        const workspaceId = session?.client_reference_id ?? session?.metadata?.workspaceId;
        if (!workspaceId) {
            this.logger.warn('checkout.session.completed without a workspace id — skipping');
            return;
        }
        const customerId = idOf(session?.customer);
        const subscriptionId = idOf(session?.subscription);
        const tier = (0, billing_constants_1.isPurchasableTier)(session?.metadata?.tier) ? session.metadata.tier : null;
        if (customerId)
            await this.upsertCustomer(workspaceId, customerId);
        if (subscriptionId && tier) {
            await this.upsertSubscription({
                workspaceId,
                stripeSubscriptionId: subscriptionId,
                status: 'active',
                tier,
                currentPeriodEnd: toDate(session?.metadata?.currentPeriodEnd),
                cancelAtPeriodEnd: false,
            });
        }
        if (tier)
            await this.syncPlan(workspaceId, tier);
    }
    /**
     * customer.subscription.created/updated — persist the latest subscription
     * state and sync the plan. A revoking status (canceled/unpaid) drops to free.
     */
    async onSubscriptionUpserted(sub) {
        const workspaceId = await this.resolveWorkspaceId(sub);
        if (!workspaceId) {
            this.logger.warn('subscription event could not be attributed to a workspace — skipping');
            return;
        }
        const tier = this.tierForSubscription(sub);
        const status = sub?.status ?? 'active';
        await this.upsertSubscription({
            workspaceId,
            stripeSubscriptionId: String(sub.id),
            status,
            tier,
            currentPeriodEnd: subscriptionPeriodEnd(sub),
            cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
        });
        // Plan sync: grant the tier while active/trialing/past_due; revoke to free
        // on a terminal status. Anything else (e.g. incomplete) leaves plan as-is.
        if (GRANTING_STATUSES.has(status))
            await this.syncPlan(workspaceId, tier);
        else if (REVOKING_STATUSES.has(status))
            await this.syncPlan(workspaceId, 'free');
    }
    /** customer.subscription.deleted — cancel the row and drop the plan to free. */
    async onSubscriptionDeleted(sub) {
        const workspaceId = await this.resolveWorkspaceId(sub);
        const subscriptionId = String(sub?.id ?? '');
        if (subscriptionId) {
            await this.db
                .update(db_1.subscriptions)
                .set({ status: 'canceled', cancelAtPeriodEnd: true, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.subscriptions.stripeSubscriptionId, subscriptionId));
        }
        if (workspaceId)
            await this.syncPlan(workspaceId, 'free');
    }
    /**
     * invoice.paid / payment_succeeded — persist the invoice for billing history
     * and, app-side (§14.1), generate a branded PDF receipt and email it to the
     * workspace's billing contacts.
     *
     * IDEMPOTENT: Stripe delivers both `invoice.paid` and
     * `invoice.payment_succeeded` for the same invoice (and may retry the webhook),
     * so we email only on the transition into a paid state. The guard is our own
     * mirror: if the invoice is already recorded as `paid` we skip the email. The
     * PDF+email is best-effort — a mail failure never fails the webhook.
     */
    async onInvoicePaid(invoice) {
        const workspaceId = await this.resolveWorkspaceIdForInvoice(invoice);
        if (!workspaceId)
            return;
        const alreadyEmailed = await this.invoiceAlreadyPaid(invoice);
        await this.upsertInvoice(workspaceId, invoice, invoice?.status ?? 'paid');
        if (!alreadyEmailed) {
            try {
                await this.emailInvoice(workspaceId, invoice);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.error(`Failed to email invoice ${idOf(invoice?.id) ?? '?'}: ${message}`);
            }
        }
    }
    /**
     * invoice.payment_failed — DUNNING. Persist the failed invoice, mark the
     * subscription past_due, notify workspace admins, and on the FINAL failed
     * attempt (Stripe has no further retry scheduled) downgrade the plan to free.
     */
    async onInvoicePaymentFailed(invoice) {
        const workspaceId = await this.resolveWorkspaceIdForInvoice(invoice);
        if (!workspaceId)
            return;
        await this.upsertInvoice(workspaceId, invoice, invoice?.status ?? 'payment_failed');
        const subscriptionId = idOf(invoice?.subscription);
        if (subscriptionId) {
            await this.db
                .update(db_1.subscriptions)
                .set({ status: 'past_due', updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.subscriptions.stripeSubscriptionId, subscriptionId));
        }
        // Final failure = Stripe scheduled no further retry. Downgrade to free.
        const isFinalAttempt = invoice?.next_payment_attempt == null;
        await this.notifyAdminsOfDunning(workspaceId, isFinalAttempt);
        if (isFinalAttempt)
            await this.syncPlan(workspaceId, 'free');
    }
    // ---------------------------------------------------------------------------
    // Persistence + plan sync helpers
    // ---------------------------------------------------------------------------
    /** The bridge to plan-based gating: keep workspaces.plan in step with Stripe. */
    async syncPlan(workspaceId, tier) {
        await this.plans.setWorkspacePlan(workspaceId, tier);
    }
    async getCustomerId(workspaceId) {
        const [row] = await this.db
            .select({ stripeCustomerId: db_1.billingCustomers.stripeCustomerId })
            .from(db_1.billingCustomers)
            .where((0, drizzle_orm_1.eq)(db_1.billingCustomers.workspaceId, workspaceId))
            .limit(1);
        return row?.stripeCustomerId ?? null;
    }
    async upsertCustomer(workspaceId, stripeCustomerId) {
        await this.db
            .insert(db_1.billingCustomers)
            .values({ workspaceId, stripeCustomerId })
            .onConflictDoUpdate({
            target: db_1.billingCustomers.workspaceId,
            set: { stripeCustomerId, updatedAt: new Date() },
        });
    }
    async upsertSubscription(row) {
        await this.db
            .insert(db_1.subscriptions)
            .values(row)
            .onConflictDoUpdate({
            target: db_1.subscriptions.stripeSubscriptionId,
            set: {
                workspaceId: row.workspaceId,
                status: row.status,
                tier: row.tier,
                currentPeriodEnd: row.currentPeriodEnd,
                cancelAtPeriodEnd: row.cancelAtPeriodEnd,
                updatedAt: new Date(),
            },
        });
    }
    async upsertInvoice(workspaceId, invoice, status) {
        const stripeInvoiceId = String(invoice?.id ?? '');
        if (!stripeInvoiceId)
            return;
        const amount = invoice?.amount_paid ?? invoice?.amount_due ?? invoice?.total ?? 0;
        const values = {
            workspaceId,
            stripeInvoiceId,
            amount: Number(amount) || 0,
            currency: String(invoice?.currency ?? 'usd'),
            status,
            hostedUrl: invoice?.hosted_invoice_url ?? null,
            pdfUrl: invoice?.invoice_pdf ?? null,
            ...(invoice?.created ? { createdAt: toDate(invoice.created) } : {}),
        };
        await this.db
            .insert(db_1.invoices)
            .values(values)
            .onConflictDoUpdate({
            target: db_1.invoices.stripeInvoiceId,
            set: {
                amount: values.amount,
                currency: values.currency,
                status: values.status,
                hostedUrl: values.hostedUrl,
                pdfUrl: values.pdfUrl,
            },
        });
    }
    /**
     * True when this Stripe invoice is ALREADY recorded as `paid` in our mirror —
     * the idempotency guard for invoice emails. Checked BEFORE the upsert flips the
     * status to paid, so the first paid event emails and every duplicate/retry
     * (invoice.payment_succeeded, webhook re-delivery) is a no-op.
     */
    async invoiceAlreadyPaid(invoice) {
        const stripeInvoiceId = String(invoice?.id ?? '');
        if (!stripeInvoiceId)
            return false;
        const [row] = await this.db
            .select({ status: db_1.invoices.status })
            .from(db_1.invoices)
            .where((0, drizzle_orm_1.eq)(db_1.invoices.stripeInvoiceId, stripeInvoiceId))
            .limit(1);
        return row?.status === 'paid';
    }
    /**
     * Render the branded PDF invoice and email it to the workspace's billing
     * contacts (its admins/owners, plus the Stripe customer_email if present).
     * No SMTP → EmailService dev-logs, like every other email. No contacts → skip.
     */
    async emailInvoice(workspaceId, invoice) {
        const recipients = await this.billingContactEmails(workspaceId, invoice);
        if (recipients.length === 0) {
            this.logger.warn(`Invoice ${idOf(invoice?.id) ?? '?'} paid but workspace ${workspaceId} has no billing contact — skipping email`);
            return;
        }
        const workspaceName = (await this.workspaceName(workspaceId)) ?? 'your workspace';
        const currency = String(invoice?.currency ?? 'usd');
        const amountTotal = Number(invoice?.amount_paid ?? invoice?.amount_due ?? invoice?.total ?? 0) || 0;
        const invoiceNumber = String(invoice?.number ?? invoice?.id ?? 'invoice');
        const status = String(invoice?.status ?? 'paid');
        const issuedAt = toDate(invoice?.created) ?? new Date();
        const lineData = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
        const lines = lineData
            .map((l) => ({
            description: String(l?.description ?? l?.price?.nickname ?? 'Subscription'),
            amount: Number(l?.amount ?? 0) || 0,
        }))
            .filter((l) => l.description.length > 0);
        const pdf = (0, invoice_pdf_1.renderInvoicePdf)({
            invoiceNumber,
            workspaceName,
            billTo: invoice?.customer_email ?? null,
            status,
            currency,
            amountTotal,
            issuedAt,
            lines,
        });
        await this.email.sendInvoicePaid({
            to: recipients.join(', '),
            workspaceName,
            invoiceNumber,
            amountLabel: (0, invoice_pdf_1.formatMoney)(amountTotal, currency),
            statusLabel: status.charAt(0).toUpperCase() + status.slice(1),
            dateLabel: issuedAt.toISOString().slice(0, 10),
            manageUrl: `${this.appUrl()}/app/${workspaceId}/settings`,
            pdf,
        });
    }
    /** Billing-contact emails: workspace admins/owners + the Stripe customer_email. */
    async billingContactEmails(workspaceId, invoice) {
        const rows = await this.db
            .select({ email: db_1.users.email })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.role, ['workspace_admin', 'super_admin'])));
        const emails = rows.map((r) => r.email);
        const fromStripe = typeof invoice?.customer_email === 'string' ? invoice.customer_email : '';
        if (fromStripe)
            emails.push(fromStripe);
        return [...new Set(emails.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0))];
    }
    async workspaceName(workspaceId) {
        const [row] = await this.db
            .select({ name: db_1.workspaces.name })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .limit(1);
        return row?.name ?? null;
    }
    /** Insert a billing_past_due notification for every workspace admin. */
    async notifyAdminsOfDunning(workspaceId, isFinal) {
        const admins = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.role, ['workspace_admin', 'super_admin'])));
        if (admins.length === 0)
            return;
        const title = isFinal ? 'Subscription downgraded — payment failed' : 'Payment failed';
        const body = isFinal
            ? 'We could not collect your subscription payment after several attempts. Your workspace has been downgraded to the Free plan. Update your payment method to restore your plan.'
            : 'A subscription payment failed. Please update your payment method to avoid losing access to your plan.';
        await this.db.insert(db_1.notifications).values(admins.map((a) => ({
            userId: a.userId,
            workspaceId,
            type: 'billing_past_due',
            title,
            body,
            target: { entityType: 'billing', entityId: workspaceId, url: `/app/${workspaceId}/settings` },
        })));
    }
    // ---------------------------------------------------------------------------
    // Attribution helpers
    // ---------------------------------------------------------------------------
    /** Resolve the workspace for a subscription object (metadata → customer row). */
    async resolveWorkspaceId(sub) {
        const fromMeta = sub?.metadata?.workspaceId;
        if (fromMeta)
            return fromMeta;
        const customerId = idOf(sub?.customer);
        return customerId ? this.workspaceIdForCustomer(customerId) : null;
    }
    /** Resolve the workspace for an invoice (metadata → customer row → subscription row). */
    async resolveWorkspaceIdForInvoice(invoice) {
        const fromMeta = invoice?.metadata?.workspaceId;
        if (fromMeta)
            return fromMeta;
        const customerId = idOf(invoice?.customer);
        if (customerId) {
            const ws = await this.workspaceIdForCustomer(customerId);
            if (ws)
                return ws;
        }
        const subscriptionId = idOf(invoice?.subscription);
        if (subscriptionId) {
            const [row] = await this.db
                .select({ workspaceId: db_1.subscriptions.workspaceId })
                .from(db_1.subscriptions)
                .where((0, drizzle_orm_1.eq)(db_1.subscriptions.stripeSubscriptionId, subscriptionId))
                .limit(1);
            return row?.workspaceId ?? null;
        }
        return null;
    }
    async workspaceIdForCustomer(customerId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.billingCustomers.workspaceId })
            .from(db_1.billingCustomers)
            .where((0, drizzle_orm_1.eq)(db_1.billingCustomers.stripeCustomerId, customerId))
            .limit(1);
        return row?.workspaceId ?? null;
    }
    /** Map a subscription's Stripe price → tier, falling back to its metadata tier. */
    tierForSubscription(sub) {
        const priceId = sub?.items?.data?.[0]?.price?.id ?? sub?.plan?.id;
        const byPrice = (0, billing_constants_1.tierFromPriceId)(this.billingConfig(), priceId);
        if (byPrice)
            return byPrice;
        if ((0, billing_constants_1.isPurchasableTier)(sub?.metadata?.tier))
            return sub.metadata.tier;
        return 'free';
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = BillingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __param(3, (0, common_1.Inject)(stripe_provider_1.STRIPE_CLIENT)),
    __metadata("design:paramtypes", [Object, config_1.ConfigService,
        plans_service_1.PlansService, Object, email_service_1.EmailService])
], BillingService);
/** A Stripe field that is either an id string or an expanded object with `id`. */
function idOf(value) {
    if (typeof value === 'string')
        return value || null;
    if (value && typeof value === 'object' && typeof value.id === 'string')
        return value.id;
    return null;
}
/** Convert a Stripe unix-seconds timestamp to a Date (null when absent). */
function toDate(unixSeconds) {
    const n = typeof unixSeconds === 'number' ? unixSeconds : Number(unixSeconds);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return new Date(n * 1000);
}
/** current_period_end lives on the item in newer API versions, else on the sub. */
function subscriptionPeriodEnd(sub) {
    return (toDate(sub?.items?.data?.[0]?.current_period_end) ??
        toDate(sub?.current_period_end));
}
//# sourceMappingURL=billing.service.js.map