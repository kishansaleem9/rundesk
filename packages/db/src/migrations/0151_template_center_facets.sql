-- §V2-13 / frame `12:14` — TEMPLATE CENTER: the browse facets.
--
-- The re-audit row read "a page, not a modal; no type facet, complexity,
-- use-cases or categories". The page half was already true; this is the other
-- half. The frame draws a left rail of checkbox facets — **Template Types**
-- (Space · Folder · List · Task · Doc · View · Whiteboard) and **Complexity**
-- (Beginner · Intermediate · Advanced) — a top-bar **Use Cases** dropdown, and
-- a body grouped into **categories** with a count and a "See N more" on each.
--
-- Four columns, because all four are FILTERED ON BY THE SERVER and counted by
-- it. A facet computed in the browser counts the array the page happened to
-- load, which is the "confident zero" waiting to happen: it is right about the
-- page and silent about the corpus.
--
-- `target_type` is three of the frame's seven, on purpose. Space, Folder and
-- List are the three a project template can genuinely be, and
-- `ProjectTemplatesService.apply` branches on all three. Task and Doc
-- templates are their own tables (`task_templates`, `doc_templates`) with
-- their own surfaces; View and Whiteboard templates do not exist in Rundesk.
-- Four more checkboxes that could only ever return nothing would be four
-- facades with counts beside them.
--
-- `category` and `use_case` are NULLABLE: a template saved from a project
-- without one is a real state, and inventing a category to avoid a null would
-- put a template in a section it does not belong to.
ALTER TABLE "project_templates" ADD COLUMN IF NOT EXISTS "target_type" text NOT NULL DEFAULT 'folder';
ALTER TABLE "project_templates" ADD COLUMN IF NOT EXISTS "complexity"  text NOT NULL DEFAULT 'beginner';
ALTER TABLE "project_templates" ADD COLUMN IF NOT EXISTS "category"    text;
ALTER TABLE "project_templates" ADD COLUMN IF NOT EXISTS "use_case"    text;

--> statement-breakpoint

-- Backfill the six built-ins that shipped before the facets existed. Without
-- this every stock template is "folder / beginner / uncategorised" and the
-- three complexity boxes read 6 / 0 / 0 — a facet that is technically correct
-- and tells you nothing. The catalog is seeded again on boot
-- (`ensureBuiltIns`), which reconciles these same values, so a database that
-- was pushed rather than migrated lands in the same place.
UPDATE "project_templates" SET "target_type" = 'folder', "complexity" = 'intermediate', "category" = 'engineering', "use_case" = 'planning'   WHERE "workspace_id" IS NULL AND "name" = 'Software sprint';
UPDATE "project_templates" SET "target_type" = 'folder', "complexity" = 'beginner',     "category" = 'operations',  "use_case" = 'onboarding' WHERE "workspace_id" IS NULL AND "name" = 'Client onboarding';
UPDATE "project_templates" SET "target_type" = 'folder', "complexity" = 'beginner',     "category" = 'marketing',   "use_case" = 'launch'     WHERE "workspace_id" IS NULL AND "name" = 'Marketing campaign';
UPDATE "project_templates" SET "target_type" = 'folder', "complexity" = 'advanced',     "category" = 'product',     "use_case" = 'launch'     WHERE "workspace_id" IS NULL AND "name" = 'Product launch';
UPDATE "project_templates" SET "target_type" = 'folder', "complexity" = 'intermediate', "category" = 'operations',  "use_case" = 'planning'   WHERE "workspace_id" IS NULL AND "name" = 'OKR quarterly cycle';
UPDATE "project_templates" SET "target_type" = 'folder', "complexity" = 'beginner',     "category" = 'engineering', "use_case" = 'support'    WHERE "workspace_id" IS NULL AND "name" = 'Bug triage flow';

--> statement-breakpoint

-- Every facet count is a GROUP BY over (platform built-ins + one workspace).
CREATE INDEX IF NOT EXISTS "ix_project_templates_ws_scope" ON "project_templates" ("workspace_id","target_type");
