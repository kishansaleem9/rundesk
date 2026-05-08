CREATE TABLE IF NOT EXISTS "workspace_integration_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "status" text NOT NULL DEFAULT 'connected',
  "scopes" text[] NOT NULL DEFAULT '{}',
  "external_account_id" text,
  "external_account_email" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "connected_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_workspace_integration_workspace_provider" UNIQUE("workspace_id", "provider")
);
