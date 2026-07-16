-- =====================================================================
-- 0072_stripe_billing.sql  (Plan §14.1 — full Stripe billing)
--
-- ADDITIVE + IDEMPOTENT — safe to re-run. Creates the local mirror of the
-- commercial subscription state Stripe owns:
--   * billing_customers  — one Stripe Customer per workspace (unique).
--   * subscriptions      — the workspace's current subscription (status + tier).
--   * invoices           — persisted Stripe invoices for the billing history UI.
--
-- These tables are written ONLY by the Stripe webhook handler. The workspace's
-- actual entitlement lives on workspaces.plan (see PlansService); the webhook
-- syncs that column from the subscription tier. With no Stripe env configured
-- the tables stay empty and every billing endpoint returns a clean
-- "billing not configured" response — zero behavior change.
--
-- Also adds the 'billing_past_due' notification type used to alert workspace
-- admins during dunning (failed-payment) handling.
-- =====================================================================

-- New notification type for dunning alerts. ADD VALUE IF NOT EXISTS is
-- idempotent; the value is not used inside this migration's transaction.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'billing_past_due';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_customers" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"       uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "stripe_customer_id" text NOT NULL,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"         timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_billing_customers_workspace" UNIQUE ("workspace_id"),
  CONSTRAINT "uq_billing_customers_stripe_customer" UNIQUE ("stripe_customer_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"           uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "stripe_subscription_id" text NOT NULL,
  "status"                 text NOT NULL,
  "tier"                   text NOT NULL,
  "current_period_end"     timestamp with time zone,
  "cancel_at_period_end"   boolean DEFAULT false NOT NULL,
  "created_at"             timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"             timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_subscriptions_stripe_subscription" UNIQUE ("stripe_subscription_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscriptions_workspace_idx" ON "subscriptions" ("workspace_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "invoices" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"      uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "stripe_invoice_id" text NOT NULL,
  "amount"            integer DEFAULT 0 NOT NULL,
  "currency"          text DEFAULT 'usd' NOT NULL,
  "status"            text NOT NULL,
  "hosted_url"        text,
  "pdf_url"           text,
  "created_at"        timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_invoices_stripe_invoice" UNIQUE ("stripe_invoice_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invoices_workspace_idx" ON "invoices" ("workspace_id");
