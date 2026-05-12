CREATE TABLE IF NOT EXISTS "sso_connections" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"           uuid NOT NULL,
  "provider"               text NOT NULL,
  "display_name"           text NOT NULL,
  "is_enabled"             boolean DEFAULT false NOT NULL,
  "enforce_for_domain"     text,
  "jit_provisioning"       boolean DEFAULT true NOT NULL,
  "default_role"           text DEFAULT 'member' NOT NULL,
  "oidc_issuer"            text,
  "oidc_client_id"         text,
  "oidc_client_secret"     text,
  "oidc_scopes"            text DEFAULT 'openid email profile',
  "saml_idp_entity_id"     text,
  "saml_idp_sso_url"       text,
  "saml_idp_certificate"   text,
  "saml_sp_entity_id"      text,
  "saml_sign_requests"     boolean DEFAULT false NOT NULL,
  "attribute_mapping"      jsonb DEFAULT '{}'::jsonb,
  "last_used_at"           timestamp with time zone,
  "created_by_id"          uuid,
  "created_at"             timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"             timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_created_by_id_users_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sso_connections" ADD CONSTRAINT "uq_sso_connection_workspace_provider" UNIQUE ("workspace_id", "provider");
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sso_connection_workspace" ON "sso_connections" USING btree ("workspace_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sso_login_states" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "workspace_id"  uuid NOT NULL,
  "state"         text NOT NULL,
  "nonce"         text,
  "code_verifier" text,
  "redirect_to"   text,
  "expires_at"    timestamp with time zone NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sso_login_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sso_login_states" ADD CONSTRAINT "sso_login_states_connection_id_sso_connections_id_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."sso_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sso_login_states" ADD CONSTRAINT "sso_login_states_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sso_login_state_expires" ON "sso_login_states" USING btree ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "scim_tokens" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name"         text NOT NULL,
  "token_hash"   text NOT NULL,
  "key_prefix"   text NOT NULL,
  "created_by_id" uuid,
  "last_used_at" timestamp with time zone,
  "expires_at"   timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "scim_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_created_by_id_users_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scim_token_workspace" ON "scim_tokens" USING btree ("workspace_id");
