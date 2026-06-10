-- Point-in-time content snapshots for doc version history / restore.

CREATE TABLE IF NOT EXISTS "doc_revisions" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "doc_id"       uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "editor_id"    uuid,
  "title"        text NOT NULL DEFAULT 'Untitled',
  "content"      jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "plaintext"    text NOT NULL DEFAULT '',
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "doc_revisions"
    ADD CONSTRAINT "doc_revisions_doc_fk"
    FOREIGN KEY ("doc_id") REFERENCES "docs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "doc_revisions"
    ADD CONSTRAINT "doc_revisions_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "doc_revisions"
    ADD CONSTRAINT "doc_revisions_editor_fk"
    FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_doc_revisions_doc"
  ON "doc_revisions" ("doc_id", "updated_at");
