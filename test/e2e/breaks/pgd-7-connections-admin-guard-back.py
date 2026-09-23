# INTEGRATION CONNECTIONS AS THEY WERE: the admin-or-manager guard in front of the permission.
# Reddens: permission-guards: "while the member granted `integrations.manage` gets past the guard to the provider"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
a = "import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'\n"
b = "import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'\nimport { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
a = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('integrations.manage')\n  @Post('workspaces/:workspaceId/integrations/connections/:provider/oauth/start')\n"
b = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, WorkspaceAdminGuard, PermissionsGuard)\n  @RequirePermissions('integrations.manage')\n  @Post('workspaces/:workspaceId/integrations/connections/:provider/oauth/start')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-7-connections-admin-guard-back: applied")
