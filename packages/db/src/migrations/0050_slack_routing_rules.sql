-- Per-channel Slack routing rules (Plan §12). Additive.
CREATE TABLE IF NOT EXISTS "slack_routing_rules" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "webhook_url"   text NOT NULL,
  "channel_name"  text,
  "project_id"    uuid,
  "event_filters" text[] NOT NULL DEFAULT '{}',
  "is_enabled"    boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "users"("id"),
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "slack_routing_rules"
    ADD CONSTRAINT "slack_routing_rules_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "slack_routing_rules_workspace_idx" ON "slack_routing_rules" ("workspace_id");
