-- §12.6 Allow an external link (e.g. a Dropbox file) to be attached to a specific
-- comment, not just a task. The link still belongs to the task; on comment delete
-- the reference clears.
ALTER TABLE task_external_links ADD COLUMN IF NOT EXISTS comment_id uuid;
DO $$ BEGIN
  ALTER TABLE task_external_links
    ADD CONSTRAINT task_external_links_comment_fk
    FOREIGN KEY (comment_id) REFERENCES task_comments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS task_external_links_comment_idx ON task_external_links (comment_id);
