-- §15 — installing a skill is a per-person choice, not a flag on the skill.
--
-- ClickUp's Skills Hub is where you "browse, install, and manage" skills, and
-- the library tabs are All Skills / Enabled / Created by me. Enabled has to be
-- per-person for those three to be three different things.
--
-- The author's `skills.enabled` is unchanged and still means what it meant: a
-- kill-switch over their own skill, for everyone at once.
CREATE TABLE IF NOT EXISTS "skill_installs" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_id"     uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "installed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_skill_installs_skill_user" UNIQUE ("skill_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_skill_installs_user_ws" ON "skill_installs" ("user_id", "workspace_id");

-- Everyone keeps the skills they have already made: authoring one is choosing
-- to use it, and a migration that quietly emptied the Enabled tab would read
-- as data loss.
INSERT INTO "skill_installs" ("skill_id", "workspace_id", "user_id")
SELECT "id", "workspace_id", "created_by_id" FROM "skills"
ON CONFLICT DO NOTHING;
