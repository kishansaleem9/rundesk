-- Link Docs to Tasks (Plan §4 relationships). Both sides workspace-scoped in the
-- service. Unique per (task, doc). Additive.
CREATE TABLE IF NOT EXISTS "task_doc_links" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id"       uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "doc_id"        uuid NOT NULL REFERENCES "docs"("id") ON DELETE CASCADE,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "task_doc_links_unique" ON "task_doc_links" ("task_id", "doc_id");
CREATE INDEX IF NOT EXISTS "task_doc_links_task_idx" ON "task_doc_links" ("task_id");
CREATE INDEX IF NOT EXISTS "task_doc_links_doc_idx" ON "task_doc_links" ("doc_id");
