-- Reusable doc templates. A snapshot of a doc's Tiptap content that new docs
-- can be created from. Workspace-scoped. Additive.
CREATE TABLE IF NOT EXISTS "doc_templates" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "description"  text,
  "icon"         text,
  "content"      jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "plaintext"    text NOT NULL DEFAULT '',
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "doc_templates_workspace_idx" ON "doc_templates" ("workspace_id");
