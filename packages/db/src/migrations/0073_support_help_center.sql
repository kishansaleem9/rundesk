-- =====================================================================
-- 0073_support_help_center.sql  (Plan §14.4 — Customer Support & Help Center)
--
-- ADDITIVE + IDEMPOTENT — safe to re-run. Adds the human support surface that
-- complements the AI help center (POST /ai/help):
--   * support_tickets          — workspace-scoped support requests with a
--                                lifecycle, priority, assignee and SLA clocks.
--   * support_ticket_messages  — the ticket conversation thread (staff/requester).
--   * status_components        — services shown on the public status page.
--   * status_incidents         — incidents posted against the status page.
--
-- Statuses / priorities / impacts are plain `text` (validated in the app, like
-- the billing tables) so there is no CREATE TYPE / ALTER TYPE to make
-- non-idempotent. Every statement uses IF NOT EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"           uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "created_by_id"          uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "subject"                text NOT NULL,
  "body"                   text DEFAULT '' NOT NULL,
  "status"                 text DEFAULT 'open' NOT NULL,
  "priority"               text DEFAULT 'normal' NOT NULL,
  "assigned_to_id"         uuid REFERENCES "users"("id") ON DELETE set null,
  "first_response_at"      timestamp with time zone,
  "resolved_at"            timestamp with time zone,
  "first_response_due_at"  timestamp with time zone NOT NULL,
  "resolution_due_at"      timestamp with time zone NOT NULL,
  "created_at"             timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"             timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_tickets_workspace_idx" ON "support_tickets" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_creator_idx" ON "support_tickets" ("created_by_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id"  uuid NOT NULL REFERENCES "support_tickets"("id") ON DELETE cascade,
  "author_id"  uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "body"       text NOT NULL,
  "is_staff"   boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_idx" ON "support_ticket_messages" ("ticket_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "status_components" (
  "id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"     text NOT NULL,
  "status"   text DEFAULT 'operational' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "status_components_position_idx" ON "status_components" ("position");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "status_incidents" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title"        text NOT NULL,
  "body"         text DEFAULT '' NOT NULL,
  "impact"       text DEFAULT 'minor' NOT NULL,
  "status"       text DEFAULT 'investigating' NOT NULL,
  "component_id" uuid REFERENCES "status_components"("id") ON DELETE set null,
  "started_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at"  timestamp with time zone,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "status_incidents_started_idx" ON "status_incidents" ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_incidents_component_idx" ON "status_incidents" ("component_id");
