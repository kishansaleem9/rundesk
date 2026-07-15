-- Custom-domain verification token + verified flag (Plan §13). Additive.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "custom_domain_token" text;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "custom_domain_verified" boolean NOT NULL DEFAULT false;
