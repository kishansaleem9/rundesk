-- §G01-9 [00:35] — the Overview's "Bookmarks" card: "save ClickUp items or any
-- URL from around the web".
--
-- Not folded into `user_dock_configs.navFavorites`, which is the obvious
-- shortcut and the wrong one: that column holds `{label, path}` internal nav
-- paths handed to the router, and an absolute `https://…` given to `navigate()`
-- goes nowhere. "Or any URL from around the web" is the entire point of the
-- feature, so it needs somewhere that can hold one.
--
-- Per person, per workspace: this is somebody's own shortlist, and a shared one
-- would need permissions, ownership, and an answer for what happens when they
-- leave.
CREATE TABLE IF NOT EXISTS "workspace_bookmarks" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title"        text NOT NULL,
  "url"          text NOT NULL,
  "position"     integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_workspace_bookmarks_owner"
  ON "workspace_bookmarks" ("workspace_id", "user_id", "position");
