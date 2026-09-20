-- §V2-12 / frames `20:57` + `21:00` — the Teams Hub empty state and the
-- per-person work preview cards.
--
-- The empty state ("Align teams and visualize their work!", Browse People |
-- Create Team, and the two explainer cards) needs no storage: both buttons act
-- on tables that already exist — `workspace_members` for Browse People and
-- `workspace_groups` for Create Team.
--
-- The PERSON CARDS need one thing Rundesk never stored. The frame draws
-- "Priya Gupta / UI designer" and "Ryan Johnson / DevOps Engineer": a name and
-- a JOB TITLE, above that person's current work. `users` has no title column,
-- and `workspace_members.role` is the permission (`workspace_admin` | `manager`
-- | `member` | `guest`). Drawing the permission under the name would label four
-- different people "member" and present it as their job — the frame says
-- otherwise, and a plausible-looking wrong value is worse than a blank.
--
-- The WORK on the card is not stored here and must not be: it is a live read of
-- `task_assignees` for that person in this workspace. Denormalising "their
-- current five" into a column is how you get a card that is confidently stale —
-- the facade this audit keeps finding, with a database row as its alibi.
--
-- One row per (workspace, user), created on first write. No backfill: nobody
-- has a title yet, and inventing one from an email local-part would put a
-- fabricated job under a real person's face.
CREATE TABLE IF NOT EXISTS "workspace_member_profiles" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id"      uuid NOT NULL,
  "job_title"    text,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "workspace_member_profiles"
    ADD CONSTRAINT "workspace_member_profiles_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "workspace_member_profiles"
    ADD CONSTRAINT "workspace_member_profiles_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

-- The upsert target. One title per person per workspace; a second row would let
-- two different jobs both be "the" answer, and which one showed would depend on
-- row order.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_workspace_member_profiles_workspace_user"
  ON "workspace_member_profiles" ("workspace_id","user_id");

--> statement-breakpoint

-- Every read is "the titles for this workspace's people", joined against the
-- member list in one go rather than one lookup per card.
CREATE INDEX IF NOT EXISTS "idx_workspace_member_profiles_workspace"
  ON "workspace_member_profiles" ("workspace_id");
