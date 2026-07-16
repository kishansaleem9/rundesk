import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type Stripe from 'stripe'
import {
  billingCustomers,
  subscriptions,
  invoices,
  workspaces,
  workspaceMembers,
  users,
  notifications,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { PlansService } from '../plans/plans.service'
import { trialDaysForPlan, type PlanId } from '../plans/plans.constants'
import { EmailService } from '../email/email.service'
import { STRIPE_CLIENT } from './stripe.provider'
import { renderInvoicePdf, formatMoney } from './invoice-pdf'
import {
  readBillingConfig,
  isBillingConfigured,
  isPurchasableTier,
  priceIdForTier,
  tierFromPriceId,
  type BillingConfig,
  type PurchasableTier,
} from './billing.constants'

/**
 * A minimally-typed Stripe event: enough to switch on `type` and read the
 * relevant object fields. The real `stripe.webhooks.constructEvent` return value
 * is structurally assignable to this, and it lets the handler be driven directly
 * with a plain crafted object (webhook verification bypassed) for verification.
 */
export type StripeEventLike = { type: string; data: { object: any } }

/**
 * Stripe subscription statuses that entitle the workspace to its paid tier.
 * `trialing` is included so a free trial (§14.1) grants the tier for its
 * duration; when the trial ends the status moves to `active` (paid) or, if the
 * charge fails, to `past_due` → `unpaid`/`canceled` (revoked below).
 */
const GRANTING_STATUSES = new Set(['active', 'trialing', 'past_due'])
/**
 * Statuses that revoke entitlement → the workspace drops back to free. This is
 * also the trial-expiry-unpaid path: a trial that ends without a successful
 * payment lands here (`unpaid`/`canceled`) and downgrades the workspace.
 */
const REVOKING_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired'])

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
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly config: ConfigService,
    private readonly plans: PlansService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly email: EmailService,
  ) {}

  private billingConfig(): BillingConfig {
    return readBillingConfig((k) => this.config.get<string>(k))
  }

  /** True when STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are set and a client exists. */
  isConfigured(): boolean {
    return Boolean(this.stripe) && isBillingConfigured(this.billingConfig())
  }

  private requireStripe(): Stripe {
    if (!this.isConfigured() || !this.stripe) {
      throw new BadRequestException(
        'Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable it.',
      )
    }
    return this.stripe
  }

  private appUrl(): string {
    return this.config.get<string>('APP_URL') ?? 'http://localhost:5173'
  }

  // ---------------------------------------------------------------------------
  // Checkout / Portal (customer-facing, super-admin/owner gated in the controller)
  // ---------------------------------------------------------------------------

  /**
   * Create a Stripe Checkout session for `tier` and return its hosted URL. The
   * workspace id rides along as client_reference_id + metadata so the
   * checkout.session.completed webhook can attribute the subscription.
   */
  async createCheckoutSession(workspaceId: string, tier: string): Promise<{ url: string }> {
    const stripe = this.requireStripe()
    if (!isPurchasableTier(tier)) {
      throw new BadRequestException(`Unknown billing tier '${tier}'. Must be one of: pro, business, enterprise`)
    }
    const priceId = priceIdForTier(this.billingConfig(), tier)
    if (!priceId) {
      throw new BadRequestException(`Stripe price for the ${tier} plan is not configured (STRIPE_PRICE_${tier.toUpperCase()}).`)
    }

    const existingCustomerId = await this.getCustomerId(workspaceId)
    const appUrl = this.appUrl()
    // Free trial (§14.1): offer the tier's configured trial when it has one
    // (pro/business = 14 days; free/enterprise = 0 = no trial). Stripe creates a
    // `trialing` subscription — a granting status — and only charges when the
    // trial ends; if that charge fails the dunning path downgrades to free.
    const trialDays = trialDaysForPlan(tier)
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
    })
    if (!session.url) throw new BadRequestException('Stripe did not return a checkout URL')
    return { url: session.url }
  }

  /**
   * Create a Stripe Billing Portal session (Stripe hosts the manage / upgrade /
   * downgrade / cancel UI). Requires an existing Stripe customer for the
   * workspace — i.e. at least one prior subscription.
   */
  async createBillingPortalSession(workspaceId: string): Promise<{ url: string }> {
    const stripe = this.requireStripe()
    const customerId = await this.getCustomerId(workspaceId)
    if (!customerId) {
      throw new BadRequestException('No billing customer for this workspace yet. Start a subscription first.')
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.appUrl()}/app/${workspaceId}/settings`,
    })
    return { url: session.url }
  }

  /** { configured, plan, subscription?, invoices[] } for the billing UI. */
  async getBillingStatus(workspaceId: string) {
    const plan = await this.plans.getWorkspacePlan(workspaceId)
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
    const invoiceRows = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.workspaceId, workspaceId))
      .orderBy(desc(invoices.createdAt))
      .limit(20)
    return {
      configured: this.isConfigured(),
      plan: { id: plan.id, label: plan.label },
      subscription: subscription ?? null,
      invoices: invoiceRows,
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  /**
   * Verify the Stripe signature against STRIPE_WEBHOOK_SECRET, then dispatch.
   * The RAW request body (not the JSON-parsed object) is required for the HMAC
   * to match — see BillingWebhookController for how the raw body is obtained.
   */
  async handleWebhook(rawBody: Buffer | string, signature: string | undefined) {
    const stripe = this.requireStripe()
    const secret = this.billingConfig().webhookSecret
    if (!secret) throw new BadRequestException('Billing is not configured')
    if (!signature) throw new BadRequestException('Missing Stripe-Signature header')
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'signature verification failed'
      throw new BadRequestException(`Webhook signature verification failed: ${message}`)
    }
    return this.processEvent(event)
  }

  /**
   * Dispatch a (already-verified) Stripe event. Public so it can be driven
   * directly in tests / verification without a valid signature. Unknown event
   * types are acknowledged and ignored.
   */
  async processEvent(event: StripeEventLike): Promise<{ received: true; type: string; handled: boolean }> {
    let handled = true
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionUpserted(event.data.object)
        break
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object)
        break
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await this.onInvoicePaid(event.data.object)
        break
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(event.data.object)
        break
      default:
        handled = false
    }
    return { received: true, type: event.type, handled }
  }

  // ---------------------------------------------------------------------------
  // Webhook handlers
  // ---------------------------------------------------------------------------

  /**
   * checkout.session.completed — the customer finished paying. Persist the
   * Stripe customer + a subscription row and sync workspaces.plan to the tier.
   * Full period/price details arrive right after via customer.subscription.*.
   */
  private async onCheckoutCompleted(session: any): Promise<void> {
    const workspaceId: string | undefined = session?.client_reference_id ?? session?.metadata?.workspaceId
    if (!workspaceId) {
      this.logger.warn('checkout.session.completed without a workspace id — skipping')
      return
    }
    const customerId = idOf(session?.customer)
    const subscriptionId = idOf(session?.subscription)
    const tier = isPurchasableTier(session?.metadata?.tier) ? (session.metadata.tier as PurchasableTier) : null

    if (customerId) await this.upsertCustomer(workspaceId, customerId)

    if (subscriptionId && tier) {
      await this.upsertSubscription({
        workspaceId,
        stripeSubscriptionId: subscriptionId,
        status: 'active',
        tier,
        currentPeriodEnd: toDate(session?.metadata?.currentPeriodEnd),
        cancelAtPeriodEnd: false,
      })
    }
    if (tier) await this.syncPlan(workspaceId, tier)
  }

  /**
   * customer.subscription.created/updated — persist the latest subscription
   * state and sync the plan. A revoking status (canceled/unpaid) drops to free.
   */
  private async onSubscriptionUpserted(sub: any): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sub)
    if (!workspaceId) {
      this.logger.warn('subscription event could not be attributed to a workspace — skipping')
      return
    }
    const tier = this.tierForSubscription(sub)
    const status: string = sub?.status ?? 'active'
    await this.upsertSubscription({
      workspaceId,
      stripeSubscriptionId: String(sub.id),
      status,
      tier,
      currentPeriodEnd: subscriptionPeriodEnd(sub),
      cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
    })
    // Plan sync: grant the tier while active/trialing/past_due; revoke to free
    // on a terminal status. Anything else (e.g. incomplete) leaves plan as-is.
    if (GRANTING_STATUSES.has(status)) await this.syncPlan(workspaceId, tier)
    else if (REVOKING_STATUSES.has(status)) await this.syncPlan(workspaceId, 'free')
  }

  /** customer.subscription.deleted — cancel the row and drop the plan to free. */
  private async onSubscriptionDeleted(sub: any): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sub)
    const subscriptionId = String(sub?.id ?? '')
    if (subscriptionId) {
      await this.db
        .update(subscriptions)
        .set({ status: 'canceled', cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    }
    if (workspaceId) await this.syncPlan(workspaceId, 'free')
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
  private async onInvoicePaid(invoice: any): Promise<void> {
    const workspaceId = await this.resolveWorkspaceIdForInvoice(invoice)
    if (!workspaceId) return
    const alreadyEmailed = await this.invoiceAlreadyPaid(invoice)
    await this.upsertInvoice(workspaceId, invoice, invoice?.status ?? 'paid')
    if (!alreadyEmailed) {
      try {
        await this.emailInvoice(workspaceId, invoice)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.error(`Failed to email invoice ${idOf(invoice?.id) ?? '?'}: ${message}`)
      }
    }
  }

  /**
   * invoice.payment_failed — DUNNING. Persist the failed invoice, mark the
   * subscription past_due, notify workspace admins, and on the FINAL failed
   * attempt (Stripe has no further retry scheduled) downgrade the plan to free.
   */
  private async onInvoicePaymentFailed(invoice: any): Promise<void> {
    const workspaceId = await this.resolveWorkspaceIdForInvoice(invoice)
    if (!workspaceId) return
    await this.upsertInvoice(workspaceId, invoice, invoice?.status ?? 'payment_failed')

    const subscriptionId = idOf(invoice?.subscription)
    if (subscriptionId) {
      await this.db
        .update(subscriptions)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    }

    // Final failure = Stripe scheduled no further retry. Downgrade to free.
    const isFinalAttempt = invoice?.next_payment_attempt == null
    await this.notifyAdminsOfDunning(workspaceId, isFinalAttempt)
    if (isFinalAttempt) await this.syncPlan(workspaceId, 'free')
  }

  // ---------------------------------------------------------------------------
  // Persistence + plan sync helpers
  // ---------------------------------------------------------------------------

  /** The bridge to plan-based gating: keep workspaces.plan in step with Stripe. */
  private async syncPlan(workspaceId: string, tier: PlanId): Promise<void> {
    await this.plans.setWorkspacePlan(workspaceId, tier)
  }

  private async getCustomerId(workspaceId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.workspaceId, workspaceId))
      .limit(1)
    return row?.stripeCustomerId ?? null
  }

  private async upsertCustomer(workspaceId: string, stripeCustomerId: string): Promise<void> {
    await this.db
      .insert(billingCustomers)
      .values({ workspaceId, stripeCustomerId })
      .onConflictDoUpdate({
        target: billingCustomers.workspaceId,
        set: { stripeCustomerId, updatedAt: new Date() },
      })
  }

  private async upsertSubscription(row: {
    workspaceId: string
    stripeSubscriptionId: string
    status: string
    tier: string
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  }): Promise<void> {
    await this.db
      .insert(subscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          workspaceId: row.workspaceId,
          status: row.status,
          tier: row.tier,
          currentPeriodEnd: row.currentPeriodEnd,
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      })
  }

  private async upsertInvoice(workspaceId: string, invoice: any, status: string): Promise<void> {
    const stripeInvoiceId = String(invoice?.id ?? '')
    if (!stripeInvoiceId) return
    const amount: number =
      invoice?.amount_paid ?? invoice?.amount_due ?? invoice?.total ?? 0
    const values = {
      workspaceId,
      stripeInvoiceId,
      amount: Number(amount) || 0,
      currency: String(invoice?.currency ?? 'usd'),
      status,
      hostedUrl: invoice?.hosted_invoice_url ?? null,
      pdfUrl: invoice?.invoice_pdf ?? null,
      ...(invoice?.created ? { createdAt: toDate(invoice.created)! } : {}),
    }
    await this.db
      .insert(invoices)
      .values(values)
      .onConflictDoUpdate({
        target: invoices.stripeInvoiceId,
        set: {
          amount: values.amount,
          currency: values.currency,
          status: values.status,
          hostedUrl: values.hostedUrl,
          pdfUrl: values.pdfUrl,
        },
      })
  }

  /**
   * True when this Stripe invoice is ALREADY recorded as `paid` in our mirror —
   * the idempotency guard for invoice emails. Checked BEFORE the upsert flips the
   * status to paid, so the first paid event emails and every duplicate/retry
   * (invoice.payment_succeeded, webhook re-delivery) is a no-op.
   */
  private async invoiceAlreadyPaid(invoice: any): Promise<boolean> {
    const stripeInvoiceId = String(invoice?.id ?? '')
    if (!stripeInvoiceId) return false
    const [row] = await this.db
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.stripeInvoiceId, stripeInvoiceId))
      .limit(1)
    return row?.status === 'paid'
  }

  /**
   * Render the branded PDF invoice and email it to the workspace's billing
   * contacts (its admins/owners, plus the Stripe customer_email if present).
   * No SMTP → EmailService dev-logs, like every other email. No contacts → skip.
   */
  private async emailInvoice(workspaceId: string, invoice: any): Promise<void> {
    const recipients = await this.billingContactEmails(workspaceId, invoice)
    if (recipients.length === 0) {
      this.logger.warn(`Invoice ${idOf(invoice?.id) ?? '?'} paid but workspace ${workspaceId} has no billing contact — skipping email`)
      return
    }
    const workspaceName = (await this.workspaceName(workspaceId)) ?? 'your workspace'
    const currency = String(invoice?.currency ?? 'usd')
    const amountTotal = Number(invoice?.amount_paid ?? invoice?.amount_due ?? invoice?.total ?? 0) || 0
    const invoiceNumber = String(invoice?.number ?? invoice?.id ?? 'invoice')
    const status = String(invoice?.status ?? 'paid')
    const issuedAt = toDate(invoice?.created) ?? new Date()

    const lineData: any[] = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : []
    const lines = lineData
      .map((l) => ({
        description: String(l?.description ?? l?.price?.nickname ?? 'Subscription'),
        amount: Number(l?.amount ?? 0) || 0,
      }))
      .filter((l) => l.description.length > 0)

    const pdf = renderInvoicePdf({
      invoiceNumber,
      workspaceName,
      billTo: invoice?.customer_email ?? null,
      status,
      currency,
      amountTotal,
      issuedAt,
      lines,
    })

    await this.email.sendInvoicePaid({
      to: recipients.join(', '),
      workspaceName,
      invoiceNumber,
      amountLabel: formatMoney(amountTotal, currency),
      statusLabel: status.charAt(0).toUpperCase() + status.slice(1),
      dateLabel: issuedAt.toISOString().slice(0, 10),
      manageUrl: `${this.appUrl()}/app/${workspaceId}/settings`,
      pdf,
    })
  }

  /** Billing-contact emails: workspace admins/owners + the Stripe customer_email. */
  private async billingContactEmails(workspaceId: string, invoice: any): Promise<string[]> {
    const rows = await this.db
      .select({ email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, ['workspace_admin', 'super_admin']),
        ),
      )
    const emails = rows.map((r) => r.email)
    const fromStripe = typeof invoice?.customer_email === 'string' ? invoice.customer_email : ''
    if (fromStripe) emails.push(fromStripe)
    return [...new Set(emails.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0))]
  }

  private async workspaceName(workspaceId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    return row?.name ?? null
  }

  /** Insert a billing_past_due notification for every workspace admin. */
  private async notifyAdminsOfDunning(workspaceId: string, isFinal: boolean): Promise<void> {
    const admins = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, ['workspace_admin', 'super_admin']),
        ),
      )
    if (admins.length === 0) return
    const title = isFinal ? 'Subscription downgraded — payment failed' : 'Payment failed'
    const body = isFinal
      ? 'We could not collect your subscription payment after several attempts. Your workspace has been downgraded to the Free plan. Update your payment method to restore your plan.'
      : 'A subscription payment failed. Please update your payment method to avoid losing access to your plan.'
    await this.db.insert(notifications).values(
      admins.map((a) => ({
        userId: a.userId,
        workspaceId,
        type: 'billing_past_due' as const,
        title,
        body,
        target: { entityType: 'billing', entityId: workspaceId, url: `/app/${workspaceId}/settings` },
      })),
    )
  }

  // ---------------------------------------------------------------------------
  // Attribution helpers
  // ---------------------------------------------------------------------------

  /** Resolve the workspace for a subscription object (metadata → customer row). */
  private async resolveWorkspaceId(sub: any): Promise<string | null> {
    const fromMeta: string | undefined = sub?.metadata?.workspaceId
    if (fromMeta) return fromMeta
    const customerId = idOf(sub?.customer)
    return customerId ? this.workspaceIdForCustomer(customerId) : null
  }

  /** Resolve the workspace for an invoice (metadata → customer row → subscription row). */
  private async resolveWorkspaceIdForInvoice(invoice: any): Promise<string | null> {
    const fromMeta: string | undefined = invoice?.metadata?.workspaceId
    if (fromMeta) return fromMeta
    const customerId = idOf(invoice?.customer)
    if (customerId) {
      const ws = await this.workspaceIdForCustomer(customerId)
      if (ws) return ws
    }
    const subscriptionId = idOf(invoice?.subscription)
    if (subscriptionId) {
      const [row] = await this.db
        .select({ workspaceId: subscriptions.workspaceId })
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
        .limit(1)
      return row?.workspaceId ?? null
    }
    return null
  }

  private async workspaceIdForCustomer(customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: billingCustomers.workspaceId })
      .from(billingCustomers)
      .where(eq(billingCustomers.stripeCustomerId, customerId))
      .limit(1)
    return row?.workspaceId ?? null
  }

  /** Map a subscription's Stripe price → tier, falling back to its metadata tier. */
  private tierForSubscription(sub: any): PlanId {
    const priceId = sub?.items?.data?.[0]?.price?.id ?? sub?.plan?.id
    const byPrice = tierFromPriceId(this.billingConfig(), priceId)
    if (byPrice) return byPrice
    if (isPurchasableTier(sub?.metadata?.tier)) return sub.metadata.tier as PurchasableTier
    return 'free'
  }
}

/** A Stripe field that is either an id string or an expanded object with `id`. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (value && typeof value === 'object' && typeof (value as any).id === 'string') return (value as any).id
  return null
}

/** Convert a Stripe unix-seconds timestamp to a Date (null when absent). */
function toDate(unixSeconds: unknown): Date | null {
  const n = typeof unixSeconds === 'number' ? unixSeconds : Number(unixSeconds)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000)
}

/** current_period_end lives on the item in newer API versions, else on the sub. */
function subscriptionPeriodEnd(sub: any): Date | null {
  return (
    toDate(sub?.items?.data?.[0]?.current_period_end) ??
    toDate(sub?.current_period_end)
  )
}
