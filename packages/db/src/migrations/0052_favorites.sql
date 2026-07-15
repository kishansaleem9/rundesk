-- User favorites / pinned items for quick navigation (Plan §2). Polymorphic by
-- (entity_type, entity_id) across spaces/lists/tasks/docs/channels. Additive.
CREATE TABLE IF NOT EXISTS "favorites" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "entity_type"  text NOT NULL,
  "entity_id"    uuid NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "favorites_user_entity_unique" ON "favorites" ("user_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "favorites_user_workspace_idx" ON "favorites" ("user_id", "workspace_id");
