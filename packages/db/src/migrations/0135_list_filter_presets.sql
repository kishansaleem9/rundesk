-- §V2-07 "Saved filters" — frame 11:41, top-right of the Filters panel.
--
-- A named set of filter rules on one list, per user. Not a saved VIEW: a view
-- also remembers the layout, which is why a saved filter can be applied on top
-- of whichever view you are already in.
--
-- Per user rather than shared, matching `saved_searches`, so a teammate cannot
-- delete the filter you use every morning.

CREATE TABLE IF NOT EXISTS list_filter_presets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  rules      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_list_filter_presets_name UNIQUE (list_id, user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_list_filter_presets_list_user
  ON list_filter_presets (list_id, user_id);
