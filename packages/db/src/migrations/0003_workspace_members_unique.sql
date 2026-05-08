-- Ensure workspace_members has at most 1 row per (workspace_id, user_id)
-- before adding the unique constraint. We keep the earliest joinedAt row.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, user_id
      ORDER BY joined_at ASC, id ASC
    ) AS rn
  FROM workspace_members
)
DELETE FROM workspace_members
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "uq_workspace_members_workspace_user"
  UNIQUE ("workspace_id", "user_id");

