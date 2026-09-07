-- §V2-08 — "Description history".
--
-- `[15:27]` "yahan par aap ko HISTORY wagera sab cheezein show hoti hain" — the
-- item she names first in the task menu of frame `15:32`. Before this, a
-- repo-wide grep for task_revisions returned nothing: only DOCS kept revisions,
-- so a description someone overwrote was gone.
--
-- Each row is what the description said UNTIL `replaced_at`, written at the
-- moment it was replaced — not a snapshot of what it became. `doc_revisions`
-- does the opposite, and the difference is deliberate: a doc starts empty and
-- is saved repeatedly, while a task's description arrives already written. If
-- this stored the NEW text, the description every task in this database has
-- right now would never be recorded anywhere, and the first edit would destroy
-- exactly the text somebody opens history to recover.
--
-- `description` is nullable because `tasks.description` is. Clearing a
-- description must be recordable as "it used to be empty" rather than as an
-- edit that never happened.

CREATE TABLE IF NOT EXISTS task_description_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: somebody leaving the company must not delete the
  -- record of what a task used to say.
  editor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  description text,
  replaced_at timestamptz NOT NULL DEFAULT now()
);

-- The only read is "this task's revisions, newest first".
CREATE INDEX IF NOT EXISTS task_description_revisions_task_idx
  ON task_description_revisions (task_id, replaced_at);
