-- §G15-10 [21:49–21:54] — "pehle space hoti hai. Iske baad LIST aati hai."
--
-- She narrates the hierarchy as two levels and makes a List by choosing a
-- Space. Ours forced a Project in between, so every task-create showed three
-- mandatory dropdowns and you had to invent a Project before you could have a
-- list.
--
-- WHAT THIS DOES NOT DO, and why. The obvious change is to make
-- `lists.project_id` nullable. It is not taken here, deliberately: 114 inner
-- joins across 34 files reach a list's workspace THROUGH its project — the
-- resource guard among them — so a list without one would resolve to no
-- workspace and 404 for everybody, while quietly vanishing from search, the
-- knowledge index, notifications and reminders. Half-converting those is how
-- you get rows that exist and cannot be seen, which is the exact defect this
-- audit keeps finding.
--
-- So the hierarchy the person sees is Space → List, and the container that
-- makes it addressable is marked and hidden. One per space, created on demand,
-- never offered as a destination, never rendered in the tree. `project_id`
-- stays NOT NULL and every existing join keeps working unchanged.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "is_default_container" boolean NOT NULL DEFAULT false;

-- At most one per space. Partial, so ordinary projects are unaffected and a
-- second default can never be created by a race between two list creates.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_projects_default_container_per_space"
  ON "projects" ("space_id")
  WHERE "is_default_container";
