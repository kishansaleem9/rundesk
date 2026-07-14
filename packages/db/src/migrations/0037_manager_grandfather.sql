-- Manager role demotion + grandfather (Area 5). Additive + idempotent.
--
-- integrations.manage, webhook.manage and automation.manage moved from the
-- manager default up to workspace_admin (see permission-catalog.ts). To avoid
-- silently revoking access from managers who already had those permissions,
-- this migration grants them explicitly via a locked "Legacy manager access"
-- custom role, assigned to every current manager. New managers do NOT get it,
-- so they receive the narrowed default. The whole thing is re-runnable.

-- 1. One grandfather role per workspace that currently has managers.
INSERT INTO "custom_roles" ("workspace_id", "name", "description", "color", "is_locked", "position")
SELECT DISTINCT wm."workspace_id",
       'Legacy manager access',
       'Auto-created when the manager role was narrowed: preserves integration, webhook and automation management for managers who had it before.',
       '#64748b', true, 999
FROM "workspace_members" wm
WHERE wm."role" = 'manager'
ON CONFLICT ("workspace_id", "name") DO NOTHING;

-- 2. Grant the three demoted permissions to each grandfather role.
INSERT INTO "custom_role_permissions" ("role_id", "permission")
SELECT cr."id", p.perm
FROM "custom_roles" cr
CROSS JOIN (VALUES ('integrations.manage'), ('webhook.manage'), ('automation.manage')) AS p(perm)
WHERE cr."name" = 'Legacy manager access'
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- 3. Assign the grandfather role to every existing manager member.
INSERT INTO "workspace_member_custom_roles" ("workspace_member_id", "role_id")
SELECT wm."id", cr."id"
FROM "workspace_members" wm
JOIN "custom_roles" cr
  ON cr."workspace_id" = wm."workspace_id" AND cr."name" = 'Legacy manager access'
WHERE wm."role" = 'manager'
ON CONFLICT ("workspace_member_id", "role_id") DO NOTHING;
