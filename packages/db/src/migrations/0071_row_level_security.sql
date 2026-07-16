-- =====================================================================
-- 0071_row_level_security.sql  (Plan §14.2 — multi-tenant isolation)
--
-- ADDITIVE, DEFENSE-IN-DEPTH row-level security. Idempotent — safe to re-run.
--
-- SAFETY / WHY THIS DOES NOT CHANGE APP BEHAVIOR
-- ----------------------------------------------
-- The application connects to Postgres as the role that OWNS these tables
-- (drizzle-kit push / migrate creates them as the connection role; verified:
-- every public table is owned by the connection role). In PostgreSQL a table
-- OWNER *bypasses* row-level security UNLESS the table is set to FORCE ROW
-- LEVEL SECURITY. This migration only ENABLEs RLS and never FORCEs it, so:
--   * the app (owner) keeps unrestricted access — ZERO behavior change, and
--     the 488-test suite stays green;
--   * RLS is nonetheless active and ENFORCED for any NON-owner / restricted
--     role (e.g. a future per-tenant connection role, or a role created for
--     BI / support / a compromised-credential blast-radius limit). That is the
--     "row-level security in PostgreSQL" requirement + real defense-in-depth.
-- Superusers also bypass RLS; a production deployment that wants enforcement
-- must connect the restricted consumers as a NON-superuser, NON-owner role
-- WITHOUT the BYPASSRLS attribute.
--
-- DEPLOYMENT NOTE (important)
-- --------------------------
-- RLS (policies, ENABLE, the app schema/function) is NOT representable in the
-- drizzle TypeScript schema, so it lives only in this raw migration. Apply it
-- via the migration ledger: `drizzle-kit migrate` (or run this file directly).
-- `drizzle-kit push` reconciles the database to the TS schema and will DISABLE
-- ROW LEVEL SECURITY / drop these policies because it cannot see them — so a
-- push-based flow (including `db:setup`, which is push + mark-applied) does NOT
-- carry RLS, and running `push` after `migrate` will strip it. This is safe for
-- the app either way (the owner bypasses RLS regardless), but a deployment that
-- wants the isolation guarantee must use the migrate path and must not `push`
-- over it afterwards. Re-running this migration re-establishes everything.
--
-- TENANT CONTEXT (GUC)
-- --------------------
-- Policies read the tenant from a session GUC, resolved by the helper
-- app.rls_current_workspace_id():
--     SELECT NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
-- The `true` (missing_ok) means an UNSET context yields NULL rather than an
-- error, and every policy treats NULL as "no tenant pinned -> allow all rows"
-- (fail-open only for the unset context; a *set but mismatched* context is
-- denied). The owner bypasses regardless; the GUC path is what makes isolation
-- real once a restricted role is used. Set it per request/txn with
-- `SELECT set_config('app.current_workspace_id', $ws, true)` (SET LOCAL) — see
-- apps/api/src/common/database/with-workspace.ts (withWorkspace helper).
--
-- COVERAGE
-- --------
--  * Direct workspace_id column .......... simple `workspace_id = tenant` policy.
--      - NOT NULL columns: row must match the tenant.
--      - NULLABLE columns (ai_usage, audit_logs, feature_flags, flag_audit_log,
--        notifications, project_templates): a NULL workspace_id marks a
--        global/shared row and stays visible to every tenant; non-NULL rows are
--        tenant-confined.
--  * Reached by a NOT NULL join path ..... EXISTS policy up to spaces.workspace_id
--      (projects, lists, tasks, custom_field_definitions, custom_field_values,
--       time_entries) or chat_channels.workspace_id (chat_messages).
--  * workspaces .......................... its own id IS the tenant key.
--  * Deliberately NOT covered (documented): leaf/child rows that are reachable
--    only through an already-protected parent (task_assignees, task_watchers,
--    task_comments & reactions, task_activity, task_checklists / items,
--    task_dependencies, task_attachments, task_label_assignments, task_doc_links,
--    sprint_tasks, chat_channel_members, chat_message_* children, folders,
--    project_members, project_statuses, space_members, space_statuses,
--    list_statuses, task_views, inbound_webhooks, list_email_aliases,
--    inbound_email_messages, form_fields, form_submissions, goal_updates,
--    automation_runs, webhook_deliveries, custom_role_permissions,
--    workspace_group_members, workspace_member_custom_roles,
--    announcement_dismissals). These carry no direct workspace_id and only a
--    multi-hop join; the primary tenant tables above are the enforced boundary.
--    They can be added later with the same EXISTS pattern if a restricted role
--    is given direct access to them.
--  * Out of scope (not workspace-scoped): users, sessions, oauth_accounts,
--    password_resets, email_verifications, user_totp_secrets,
--    web_push_subscriptions, organizations, organization_members, invitations.
-- =====================================================================

-- Tenant-context helper. STABLE (constant within a statement), lives in a
-- dedicated `app` schema; USAGE/EXECUTE granted to PUBLIC so restricted roles
-- can evaluate the policies. NULLIF makes an empty-string GUC behave as unset
-- instead of raising on the ::uuid cast.
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.rls_current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.rls_current_workspace_id() TO PUBLIC;
--> statement-breakpoint
-- workspaces: its own primary key IS the tenant identifier.
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "workspaces";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "workspaces"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR id = app.rls_current_workspace_id());
--> statement-breakpoint
-- Direct workspace_id column (NOT NULL): row must belong to the pinned tenant.
--> statement-breakpoint
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "announcements";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "announcements"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "api_keys";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "api_keys"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "automations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "automations";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "automations"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "chat_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "chat_channels";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "chat_channels"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "chat_custom_emoji" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "chat_custom_emoji";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "chat_custom_emoji"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "clickup_import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "clickup_import_jobs";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "clickup_import_jobs"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "clients";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "clients"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "custom_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "custom_reports";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "custom_reports"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "custom_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "custom_roles";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "custom_roles"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "dashboard_presets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "dashboard_presets";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "dashboard_presets"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "doc_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "doc_comments";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "doc_comments"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "doc_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "doc_revisions";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "doc_revisions"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "doc_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "doc_templates";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "doc_templates"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "docs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "docs";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "docs"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "favorites";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "favorites"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "forms";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "forms"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "goal_key_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "goal_key_results";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "goal_key_results"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "goals";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "goals"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "integration_access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "integration_access_requests";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "integration_access_requests"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "labels";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "labels"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "personal_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "personal_tasks";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "personal_tasks"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "project_health_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "project_health_scores";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "project_health_scores"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "reminders";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "reminders"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "saved_searches";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "saved_searches"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "scim_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "scim_tokens";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "scim_tokens"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "slack_integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "slack_integrations";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "slack_integrations"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "slack_routing_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "slack_routing_rules";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "slack_routing_rules"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "spaces";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "spaces"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "sprints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "sprints";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "sprints"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "sso_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "sso_connections";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "sso_connections"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "sso_login_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "sso_login_states";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "sso_login_states"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "task_calendar_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "task_calendar_links";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "task_calendar_links"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "task_external_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "task_external_links";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "task_external_links"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "task_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "task_templates";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "task_templates"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "time_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "time_approvals";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "time_approvals"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "user_dock_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "user_dock_configs";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "user_dock_configs"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "user_ical_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "user_ical_tokens";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "user_ical_tokens"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "webhooks";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "webhooks"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "workspace_canvases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "workspace_canvases";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "workspace_canvases"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "workspace_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "workspace_groups";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "workspace_groups"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "workspace_integration_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "workspace_integration_connections";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "workspace_integration_connections"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "workspace_members";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "workspace_members"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "workspace_security_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "workspace_security_settings";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "workspace_security_settings"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
-- Direct workspace_id column (NULLABLE): NULL = global/shared, stays visible;
-- non-NULL rows are tenant-confined.
--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "ai_usage";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "ai_usage"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "audit_logs";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "audit_logs"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "feature_flags";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "feature_flags"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "flag_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "flag_audit_log";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "flag_audit_log"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "notifications";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "notifications"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
ALTER TABLE "project_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "project_templates";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "project_templates"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id())
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR workspace_id IS NULL
     OR workspace_id = app.rls_current_workspace_id());
--> statement-breakpoint
-- Reached via a NOT NULL join path to spaces.workspace_id /
-- chat_channels.workspace_id (no direct workspace_id column).
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "projects";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "projects"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM spaces s
          WHERE s.id = projects.space_id
            AND s.workspace_id = app.rls_current_workspace_id()))
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM spaces s
          WHERE s.id = projects.space_id
            AND s.workspace_id = app.rls_current_workspace_id()));
--> statement-breakpoint
ALTER TABLE "lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "lists";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "lists"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM projects p JOIN spaces s ON s.id = p.space_id
          WHERE p.id = lists.project_id
            AND s.workspace_id = app.rls_current_workspace_id()))
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM projects p JOIN spaces s ON s.id = p.space_id
          WHERE p.id = lists.project_id
            AND s.workspace_id = app.rls_current_workspace_id()));
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "tasks";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "tasks"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM lists l
          JOIN projects p ON p.id = l.project_id
          JOIN spaces s ON s.id = p.space_id
          WHERE l.id = tasks.list_id
            AND s.workspace_id = app.rls_current_workspace_id()))
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM lists l
          JOIN projects p ON p.id = l.project_id
          JOIN spaces s ON s.id = p.space_id
          WHERE l.id = tasks.list_id
            AND s.workspace_id = app.rls_current_workspace_id()));
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "chat_messages";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "chat_messages"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM chat_channels c
          WHERE c.id = chat_messages.channel_id
            AND c.workspace_id = app.rls_current_workspace_id()))
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM chat_channels c
          WHERE c.id = chat_messages.channel_id
            AND c.workspace_id = app.rls_current_workspace_id()));
--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "time_entries";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "time_entries"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM tasks t
          JOIN lists l ON l.id = t.list_id
          JOIN projects p ON p.id = l.project_id
          JOIN spaces s ON s.id = p.space_id
          WHERE t.id = time_entries.task_id
            AND s.workspace_id = app.rls_current_workspace_id()))
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM tasks t
          JOIN lists l ON l.id = t.list_id
          JOIN projects p ON p.id = l.project_id
          JOIN spaces s ON s.id = p.space_id
          WHERE t.id = time_entries.task_id
            AND s.workspace_id = app.rls_current_workspace_id()));
--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "custom_field_definitions";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "custom_field_definitions"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM projects p JOIN spaces s ON s.id = p.space_id
          WHERE p.id = custom_field_definitions.project_id
            AND s.workspace_id = app.rls_current_workspace_id()))
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM projects p JOIN spaces s ON s.id = p.space_id
          WHERE p.id = custom_field_definitions.project_id
            AND s.workspace_id = app.rls_current_workspace_id()));
--> statement-breakpoint
ALTER TABLE "custom_field_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "rls_ws_isolation" ON "custom_field_values";--> statement-breakpoint
CREATE POLICY "rls_ws_isolation" ON "custom_field_values"
  FOR ALL
  USING (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM tasks t
          JOIN lists l ON l.id = t.list_id
          JOIN projects p ON p.id = l.project_id
          JOIN spaces s ON s.id = p.space_id
          WHERE t.id = custom_field_values.task_id
            AND s.workspace_id = app.rls_current_workspace_id()))
  WITH CHECK (app.rls_current_workspace_id() IS NULL
     OR EXISTS (SELECT 1 FROM tasks t
          JOIN lists l ON l.id = t.list_id
          JOIN projects p ON p.id = l.project_id
          JOIN spaces s ON s.id = p.space_id
          WHERE t.id = custom_field_values.task_id
            AND s.workspace_id = app.rls_current_workspace_id()));
