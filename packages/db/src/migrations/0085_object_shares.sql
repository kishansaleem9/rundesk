-- Share & Permissions — one grant table covering every shareable object, so a
-- folder / list / task / doc can be shared exactly like a space or project, and
-- so someone OUTSIDE the workspace can be invited by email before they have a
-- user row (docs/share-and-permissions-spec.md).
--
-- `level` reuses the existing container_role enum: admin (ClickUp "full edit"),
-- edit, comment, view. Most-specific-wins resolution happens in the API.
CREATE TABLE IF NOT EXISTS "object_shares" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- space | folder | project | list | task | doc
  "object_type"   text NOT NULL,
  "object_id"     uuid NOT NULL,
  -- Exactly one of user_id / invited_email is set: a resolved member, or an
  -- outsider who has not accepted yet.
  "user_id"       uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "invited_email" text,
  "level"         "container_role" NOT NULL DEFAULT 'view',
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "object_shares_principal_check"
    CHECK (("user_id" IS NOT NULL) <> ("invited_email" IS NOT NULL))
);

-- One grant per principal per object; re-sharing updates the level in place.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_object_shares_user"
  ON "object_shares" ("object_type", "object_id", "user_id")
  WHERE "user_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_object_shares_email"
  ON "object_shares" ("object_type", "object_id", lower("invited_email"))
  WHERE "invited_email" IS NOT NULL;

-- Listing an object's shares, and resolving one user's level across objects.
CREATE INDEX IF NOT EXISTS "idx_object_shares_object" ON "object_shares" ("object_type", "object_id");
CREATE INDEX IF NOT EXISTS "idx_object_shares_user"   ON "object_shares" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_object_shares_email"  ON "object_shares" (lower("invited_email"));
CREATE INDEX IF NOT EXISTS "idx_object_shares_ws"     ON "object_shares" ("workspace_id");
