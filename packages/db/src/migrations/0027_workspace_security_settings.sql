-- Per-workspace security policy (IP allowlist, session limits, login policy)
-- plus failed-login lockout tracking on users. All defaults are chosen so an
-- un-configured workspace behaves exactly as before the migration.

CREATE TABLE IF NOT EXISTS "workspace_security_settings" (
  "workspace_id"                uuid PRIMARY KEY NOT NULL,
  "ip_allowlist_enabled"        boolean NOT NULL DEFAULT false,
  "ip_allowlist"                jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ip_allowlist_include_admins" boolean NOT NULL DEFAULT false,
  "session_timeout_minutes"     integer NOT NULL DEFAULT 10080,
  "max_concurrent_sessions"     integer NOT NULL DEFAULT 0,
  "lockout_enabled"             boolean NOT NULL DEFAULT true,
  "lockout_threshold"           integer NOT NULL DEFAULT 5,
  "lockout_duration_minutes"    integer NOT NULL DEFAULT 30,
  "require_strong_passwords"    boolean NOT NULL DEFAULT true,
  "block_breached_passwords"    boolean NOT NULL DEFAULT false,
  "updated_at"                  timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by_id"               uuid
);

DO $$ BEGIN
  ALTER TABLE "workspace_security_settings"
    ADD CONSTRAINT "workspace_security_settings_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workspace_security_settings"
    ADD CONSTRAINT "workspace_security_settings_updated_by_fk"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Failed-login lockout tracking on users.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
