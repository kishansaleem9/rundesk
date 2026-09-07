-- §V2-06 — "Create a Space" collects a name and nothing else today.
--
-- Frame 06:52 adds Default permission and Make Private to step one; frame
-- 07:06 adds a whole second step of workflow presets, each carrying default
-- views, task statuses and ClickApps; and [07:46] says the preset seeds the
-- space's first list.
--
-- `default_permission` is text with a CHECK rather than a new pg enum because
-- it is the same four rungs as `object_shares.level`, and a second enum naming
-- the same ladder is a second thing to keep in step.

ALTER TABLE spaces ADD COLUMN IF NOT EXISTS default_permission text NOT NULL DEFAULT 'edit';
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS features jsonb;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS preset_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_spaces_default_permission') THEN
    ALTER TABLE spaces
      ADD CONSTRAINT chk_spaces_default_permission
      CHECK (default_permission IN ('view', 'comment', 'edit', 'admin'));
  END IF;
END $$;
