# ACCESS REQUESTS AS THEY WERE: the admin-or-manager guard in front of the permission.
# Reddens: permission-guards: "and the member granted `integrations.access_requests.manage` may answer an access request"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
a = "import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'\n"
b = "import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'\nimport { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
a = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('integrations.access_requests.manage')\n  @Patch('workspaces/:workspaceId/integrations/connections/access-requests/:provider')\n"
b = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, WorkspaceAdminGuard, PermissionsGuard)\n  @RequirePermissions('integrations.access_requests.manage')\n  @Patch('workspaces/:workspaceId/integrations/connections/access-requests/:provider')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-8-access-requests-admin-guard-back: applied")
