# SSO AS IT WAS: an admin-or-manager guard in front of `sso.manage`, so the grant is useless.
# Reddens: permission-guards: "while a member granted `sso.manage` by a custom role reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/sso.controller.ts'
a = "import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'\n"
b = "import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'\nimport { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/sso/sso.controller.ts'
a = "@UseGuards(JwtAuthGuard, PermissionsGuard)\n@RequirePermissions('sso.manage')\nexport class SsoAdminController {\n"
b = "@UseGuards(JwtAuthGuard, WorkspaceAdminGuard, PermissionsGuard)\n@RequirePermissions('sso.manage')\nexport class SsoAdminController {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-1-sso-admin-guard-back: applied")
