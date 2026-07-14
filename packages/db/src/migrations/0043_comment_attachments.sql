-- Allow attachments to be scoped to a specific comment (Plan §4). Additive +
-- idempotent. The file still belongs to the task; deleting the comment keeps
-- the file and nulls this reference.
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "comment_id" uuid;

DO $$ BEGIN
  ALTER TABLE "task_attachments"
    ADD CONSTRAINT "task_attachments_comment_id_task_comments_id_fk"
    FOREIGN KEY ("comment_id") REFERENCES "task_comments"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "task_attachments_comment_id_idx" ON "task_attachments" ("comment_id");
