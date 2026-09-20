import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { Db } from '@rundesk/db';
import { PlansService } from '../plans/plans.service';
import { EmailService } from '../email/email.service';
/**
 * A minimally-typed Stripe event: enough to switch on `type` and read the
 * relevant object fields. The real `stripe.webhooks.constructEvent` return value
 * is structurally assignable to this, and it lets the handler be driven directly
 * with a plain crafted object (webhook verification bypassed) for verification.
 */
export type StripeEventLike = {
    type: string;
    data: {
        object: any;
    };
};
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
export declare class BillingService {
    private readonly db;
    private readonly config;
    private readonly plans;
    private readonly stripe;
    private readonly email;
    private readonly logger;
    constructor(db: Db, config: ConfigService, plans: PlansService, stripe: Stripe | null, email: EmailService);
    private billingConfig;
    /** True when STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are set and a client exists. */
    isConfigured(): boolean;
    private requireStripe;
    private appUrl;
    /**
     * Create a Stripe Checkout session for `tier` and return its hosted URL. The
     * workspace id rides along as client_reference_id + metadata so the
     * checkout.session.completed webhook can attribute the subscription.
     */
    createCheckoutSession(workspaceId: string, tier: string): Promise<{
        url: string;
    }>;
    /**
     * Create a Stripe Billing Portal session (Stripe hosts the manage / upgrade /
     * downgrade / cancel UI). Requires an existing Stripe customer for the
     * workspace — i.e. at least one prior subscription.
     */
    createBillingPortalSession(workspaceId: string): Promise<{
        url: string;
    }>;
    /** { configured, plan, subscription?, invoices[] } for the billing UI. */
    getBillingStatus(workspaceId: string): Promise<{
        configured: boolean;
        plan: {
            id: "enterprise" | "free" | "pro" | "business";
            label: string;
        };
        subscription: {
            id: string;
            workspaceId: string;
            stripeSubscriptionId: string;
            status: string;
            tier: string;
            currentPeriodEnd: Date | null;
            cancelAtPeriodEnd: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        invoices: {
            id: string;
            workspaceId: string;
            stripeInvoiceId: string;
            amount: number;
            currency: string;
            status: string;
            hostedUrl: string | null;
            pdfUrl: string | null;
            createdAt: Date;
        }[];
    }>;
    /**
     * Verify the Stripe signature against STRIPE_WEBHOOK_SECRET, then dispatch.
     * The RAW request body (not the JSON-parsed object) is required for the HMAC
     * to match — see BillingWebhookController for how the raw body is obtained.
     */
    handleWebhook(rawBody: Buffer | string, signature: string | undefined): Promise<{
        received: true;
        type: string;
        handled: boolean;
    }>;
    /**
     * Dispatch a (already-verified) Stripe event. Public so it can be driven
     * directly in tests / verification without a valid signature. Unknown event
     * types are acknowledged and ignored.
     */
    processEvent(event: StripeEventLike): Promise<{
        received: true;
        type: string;
        handled: boolean;
    }>;
    /**
     * checkout.session.completed — the customer finished paying. Persist the
     * Stripe customer + a subscription row and sync workspaces.plan to the tier.
     * Full period/price details arrive right after via customer.subscription.*.
     */
    private onCheckoutCompleted;
    /**
     * customer.subscription.created/updated — persist the latest subscription
     * state and sync the plan. A revoking status (canceled/unpaid) drops to free.
     */
    private onSubscriptionUpserted;
    /** customer.subscription.deleted — cancel the row and drop the plan to free. */
    private onSubscriptionDeleted;
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
    private onInvoicePaid;
    /**
     * invoice.payment_failed — DUNNING. Persist the failed invoice, mark the
     * subscription past_due, notify workspace admins, and on the FINAL failed
     * attempt (Stripe has no further retry scheduled) downgrade the plan to free.
     */
    private onInvoicePaymentFailed;
    /** The bridge to plan-based gating: keep workspaces.plan in step with Stripe. */
    private syncPlan;
    private getCustomerId;
    private upsertCustomer;
    private upsertSubscription;
    private upsertInvoice;
    /**
     * True when this Stripe invoice is ALREADY recorded as `paid` in our mirror —
     * the idempotency guard for invoice emails. Checked BEFORE the upsert flips the
     * status to paid, so the first paid event emails and every duplicate/retry
     * (invoice.payment_succeeded, webhook re-delivery) is a no-op.
     */
    private invoiceAlreadyPaid;
    /**
     * Render the branded PDF invoice and email it to the workspace's billing
     * contacts (its admins/owners, plus the Stripe customer_email if present).
     * No SMTP → EmailService dev-logs, like every other email. No contacts → skip.
     */
    private emailInvoice;
    /** Billing-contact emails: workspace admins/owners + the Stripe customer_email. */
    private billingContactEmails;
    private workspaceName;
    /** Insert a billing_past_due notification for every workspace admin. */
    private notifyAdminsOfDunning;
    /** Resolve the workspace for a subscription object (metadata → customer row). */
    private resolveWorkspaceId;
    /** Resolve the workspace for an invoice (metadata → customer row → subscription row). */
    private resolveWorkspaceIdForInvoice;
    private workspaceIdForCustomer;
    /** Map a subscription's Stripe price → tier, falling back to its metadata tier. */
    private tierForSubscription;
}
