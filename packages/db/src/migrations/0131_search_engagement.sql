-- §G03-6 [04:00–04:04] — "Trending In Workspace" and "Trending For You", the
-- two sort modes her Sort menu has and ours did not.
--
-- Trending is a claim about what people are OPENING and nothing recorded that.
-- It could not be faked from data already on hand: `updated_at` tells you what
-- was EDITED, which is a different and much smaller group of people than the
-- ones reading it.
--
-- An append-only event rather than a counter column. Trending is about a WINDOW
-- — what is hot this week — and a lifetime counter cannot answer that: the
-- busiest task of last quarter would sit at the top of the list forever. Rows
-- are cheap; a window is a WHERE clause.
CREATE TABLE IF NOT EXISTS "search_engagement" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entity_type"  text NOT NULL,
  "entity_id"    text NOT NULL,
  "opened_at"    timestamptz NOT NULL DEFAULT now()
);

-- The two questions the sort modes ask, each within a time window.
CREATE INDEX IF NOT EXISTS "idx_search_engagement_workspace"
  ON "search_engagement" ("workspace_id", "opened_at");
CREATE INDEX IF NOT EXISTS "idx_search_engagement_user"
  ON "search_engagement" ("workspace_id", "user_id", "opened_at");
