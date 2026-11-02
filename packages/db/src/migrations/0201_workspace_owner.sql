-- A WORKSPACE HAS ONE OWNER (`found-02-nov/workspace-has-no-owner`; QA WS-015 to WS-018).
--
-- ClickUp's Workspace owner: whoever made it, until they transfer it. Only the owner deletes the
-- workspace or hands it over, the owner never leaves it (they transfer it first), and nobody removes
-- or demotes them. Ownership lived only on the organization, so somebody who made a workspace inside
-- an organization they were invited to did not own it, and nobody could leave or hand one over.
--
-- The owner of a workspace that already exists is its earliest admin: the person who made it, since
-- the creation inserts its maker as its first admin, or whoever has been its admin longest if they
-- have gone. An agent's account is never one.

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

UPDATE "workspaces" w SET "owner_id" = (
  SELECT wm."user_id"
    FROM "workspace_members" wm
    JOIN "users" u ON u."id" = wm."user_id"
   WHERE wm."workspace_id" = w."id"
     AND wm."role" = 'workspace_admin'
     AND u."is_agent" = false
   ORDER BY wm."joined_at" ASC, wm."id" ASC
   LIMIT 1
)
WHERE w."owner_id" IS NULL;
