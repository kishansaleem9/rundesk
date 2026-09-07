-- §V2-02 — the Planner's time blocks, and its own preferences.
--
-- `[14:52]` "un ko bhi apne planner mein add kar sakti hoon DRAG AND DROP se".
-- Frame 13:08 is the grid they land on. Before this, a repo-wide grep for
-- time_block returned nothing: Rundesk's calendar was a list VIEW TYPE and a
-- read-only strip, with nowhere to record "I will work on this from 2 to 4".
--
-- A block is not a due date. A due date says when a thing must be finished; a
-- block says when you mean to work on it, and one task can have several — an
-- hour Tuesday and two more Thursday. That is why it is a table, not columns.

CREATE TABLE IF NOT EXISTS task_time_blocks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title        text,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  is_all_day   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_time_blocks_has_subject CHECK (task_id IS NOT NULL OR title IS NOT NULL),
  CONSTRAINT task_time_blocks_ends_after_starts CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_task_time_blocks_owner_span
  ON task_time_blocks (user_id, workspace_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_task_time_blocks_task
  ON task_time_blocks (task_id);

-- Null means the settings page has never been opened, so every default is the
-- app's. Week start, timezone and time format are NOT in here: they are
-- existing columns on this table, and a second copy that could disagree with
-- them would be a bug with a settings page for creating it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS planner_settings jsonb;
