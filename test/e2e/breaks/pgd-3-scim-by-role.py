# SCIM TOKENS AS THEY WERE: the admin-or-manager guard, and no permission.
# Reddens: permission-guards: "a manager, who does not hold `sso.manage`, may not mint a SCIM token — none is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/scim.controller.ts'
a = "import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'\n"
b = "import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'\nimport { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/sso/scim.controller.ts'
a = "@UseGuards(JwtAuthGuard, PermissionsGuard)\n@RequirePermissions('sso.manage')\nexport class ScimAdminController {\n"
b = '@UseGuards(JwtAuthGuard, WorkspaceAdminGuard)\nexport class ScimAdminController {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-3-scim-by-role: applied")
