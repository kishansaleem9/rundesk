-- §2 per-item privacy: add a public/private visibility flag to folders, lists
-- and tasks (mirroring spaces/projects). A 'private' item is visible only to
-- its creator, its assignees (tasks only) and workspace managers/admins; the
-- enforcement lives in the API read paths + ResourceMemberGuard. Additive +
-- idempotent, defaulting to 'public' so existing rows keep their behaviour.
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "visibility" "container_visibility" NOT NULL DEFAULT 'public';
ALTER TABLE "lists"   ADD COLUMN IF NOT EXISTS "visibility" "container_visibility" NOT NULL DEFAULT 'public';
ALTER TABLE "tasks"   ADD COLUMN IF NOT EXISTS "visibility" "container_visibility" NOT NULL DEFAULT 'public';
