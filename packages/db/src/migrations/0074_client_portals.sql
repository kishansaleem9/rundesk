-- =====================================================================
-- 0074_client_portals.sql  (Plan §14.7 — Client-Facing Portal)
--
-- ADDITIVE + IDEMPOTENT — safe to re-run. Adds a single table:
--   * client_portals — a tokenized, read-only, client-facing view of ONE
--                      project. Mirrors the public doc-share / form pattern:
--                      no auth, token-scoped, minimal projection.
--
-- A portal exposes exactly one project's client-safe task list plus workspace
-- branding. `is_enabled` gates the public read (disabled → 404) and
-- `show_completed` hides closed tasks. `token` is a random ~24-char string
-- (unique). Booleans / statuses are plain columns validated in the app, so
-- there is no CREATE TYPE to make non-idempotent. Every statement uses
-- IF NOT EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "client_portals" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"   uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "project_id"     uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "client_id"      uuid REFERENCES "clients"("id") ON DELETE set null,
  "token"          text NOT NULL,
  "name"           text,
  "is_enabled"     boolean DEFAULT true NOT NULL,
  "show_completed" boolean DEFAULT true NOT NULL,
  "created_by_id"  uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL,
  "last_viewed_at" timestamp with time zone
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "client_portals_token_unique" ON "client_portals" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_portals_project_idx" ON "client_portals" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_portals_workspace_idx" ON "client_portals" ("workspace_id");
