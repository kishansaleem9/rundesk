-- §V2-07 — "Private view", "Protect view", "Pin view", "Autosave for me".
--
-- Frames 10:36 (board) and 11:14 (list): the Customize panel carries four
-- switches that `task_views` had no column for. Before this, every saved view
-- was visible to every member of the list AND deletable by them — including
-- the default view everyone works in.
--
-- `visibility` is text rather than an enum on purpose: this table is created by
-- `drizzle-kit push` from the TypeScript source (it has no CREATE TABLE in any
-- migration), so a pg enum declared only here would exist on upgraded
-- deployments and not on fresh ones. Text plus a CHECK is the same guarantee
-- and is identical either way.

ALTER TABLE task_views ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE task_views ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'everyone';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_task_views_visibility') THEN
    ALTER TABLE task_views
      ADD CONSTRAINT chk_task_views_visibility
      CHECK (visibility IN ('everyone', 'private', 'protected'));
  END IF;
END $$;

-- "Autosave for me" is per user by its own tooltip — "Each user turns this on
-- independently" — so it cannot live on the view.
CREATE TABLE IF NOT EXISTS task_view_prefs (
  view_id    uuid NOT NULL REFERENCES task_views(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  autosave   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_view_prefs_pkey PRIMARY KEY (view_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_view_prefs_user ON task_view_prefs (user_id);
