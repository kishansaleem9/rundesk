-- Task ↔ external-service links (Plan §12.8 GitHub/GitLab, §12.2 Google Drive).
-- A link is created by pasting a URL; the API parses it to detect provider +
-- kind and stores structured refs in metadata. `status` holds the live PR/MR/
-- issue state (open/merged/closed) and stays NULL until a provider fetch runs
-- behind a configured integration connection. Workspace-scoped; task FK
-- cascades. Additive + idempotent — safe to re-run.
CREATE TABLE IF NOT EXISTS "task_external_links" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id"       uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider"      text NOT NULL,
  "kind"          text NOT NULL,
  "url"           text NOT NULL,
  "external_id"   text,
  "title"         text,
  "status"        text,
  "metadata"      jsonb,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "task_external_links_task_idx" ON "task_external_links" ("task_id");
CREATE INDEX IF NOT EXISTS "task_external_links_workspace_idx" ON "task_external_links" ("workspace_id");
