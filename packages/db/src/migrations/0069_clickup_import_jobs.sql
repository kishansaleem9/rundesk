-- ClickUp CSV import progress rows (Plan §12.5). The import runs server-side
-- after the request returns; the client polls a job row for a real progress bar
-- (processed/total) plus live created/updated/skipped counters. The final
-- enriched summary — per-entity totals, custom-field counts, conflict tallies,
-- and the honest "not imported via CSV" note (comments/attachments) — lands in
-- `result` when status = 'completed'. Additive + idempotent — safe to re-run.
CREATE TABLE IF NOT EXISTS "clickup_import_jobs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "status"        text NOT NULL DEFAULT 'pending',
  "total"         integer NOT NULL DEFAULT 0,
  "processed"     integer NOT NULL DEFAULT 0,
  "created_count" integer NOT NULL DEFAULT 0,
  "updated_count" integer NOT NULL DEFAULT 0,
  "skipped_count" integer NOT NULL DEFAULT 0,
  "error"         text,
  "result"        jsonb,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "clickup_import_jobs_workspace_idx" ON "clickup_import_jobs" ("workspace_id");
