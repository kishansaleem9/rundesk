-- Make built-in (platform-wide, workspace_id IS NULL) project templates unique
-- by name so idempotent seeding on boot is race-safe. Workspace-owned templates
-- (workspace_id NOT NULL) are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_builtin_template_name"
  ON "project_templates" ("name")
  WHERE "workspace_id" IS NULL;
