-- AI CREDITS, AS CLICKUP COUNTS THEM (`commit-log/log-3943965-1`, `ledger-rows/row-869`),
-- AND A FREE PLAN'S USES OF A PAID FEATURE (`ledger-rows/row-788`).
--
--   · `ai_usage.credits`: what each call cost, at a tenth of a cent a credit.
--   · `ai_credit_purchases`: credits an admin bought, counted once paid.
--   · `plan_feature_uses`: the free uses of a feature a workspace has spent —
--     a member's day with it each — which never reset.
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "credits" integer DEFAULT 0 NOT NULL;
CREATE TABLE IF NOT EXISTS "ai_credit_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checkout_session_id" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "ai_credit_purchases_checkout_session_id_unique" UNIQUE("checkout_session_id"),
	CONSTRAINT "ai_credit_purchases_status_check" CHECK ("status" IN ('pending', 'paid')),
	CONSTRAINT "ai_credit_purchases_credits_check" CHECK ("credits" > 0)
);
DO $$ BEGIN
 ALTER TABLE "ai_credit_purchases" ADD CONSTRAINT "ai_credit_purchases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "ai_credit_purchases" ADD CONSTRAINT "ai_credit_purchases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_ai_credit_purchases_workspace" ON "ai_credit_purchases" USING btree ("workspace_id","paid_at");
CREATE TABLE IF NOT EXISTS "plan_feature_uses" (
	"workspace_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_feature_uses_pkey" PRIMARY KEY("workspace_id","feature","user_id","day")
);
DO $$ BEGIN
 ALTER TABLE "plan_feature_uses" ADD CONSTRAINT "plan_feature_uses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "plan_feature_uses" ADD CONSTRAINT "plan_feature_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
