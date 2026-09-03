-- §G15 [21:49–21:54] — "pehle space hoti hai. Iske baad LIST aati hai."
--
-- She narrates the hierarchy as two levels and creates a List by choosing a
-- Space. Ours forces a Project in between: `lists.project_id` is NOT NULL and a
-- list has no other way to know where it lives, so "which Space is this list
-- in?" costs two joins and a list without a Project would be an orphan.
--
-- This is the additive half, and it is deliberately separate. Giving every list
-- a direct `space_id` is true of the data today — every list already has
-- exactly one space, reachable through its project — so the backfill cannot be
-- ambiguous and nothing needs to change behaviour to accept it. Making
-- `project_id` nullable is the step that changes meaning, and it goes on top of
-- this rather than beside it.
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE CASCADE;

-- Backfilled from the owning project, which is the only place this could come
-- from and the definition of correct here.
UPDATE "lists" AS l
   SET "space_id" = p."space_id"
  FROM "projects" AS p
 WHERE l."project_id" = p."id"
   AND l."space_id" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_lists_space" ON "lists" ("space_id");
