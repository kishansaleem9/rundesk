-- §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
--
-- A private per-person save on a task comment, the sibling of
-- `chat_message_saves`. The unique index is the toggle: saving twice is not two
-- bookmarks, and it is what makes an insert idempotent without a read first.
CREATE TABLE IF NOT EXISTS task_comment_saves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS task_comment_saves_unique
  ON task_comment_saves (comment_id, user_id);

-- The read is always "everything I saved, newest first", so the user column is
-- the one that needs the index.
CREATE INDEX IF NOT EXISTS idx_task_comment_saves_user
  ON task_comment_saves (user_id);
