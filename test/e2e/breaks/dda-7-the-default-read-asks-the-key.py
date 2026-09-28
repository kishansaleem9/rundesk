# READING THE WORKSPACE DEFAULT ASKS THE KEY THAT SETS IT: a plain member and a manager are refused their landing dashboard (403).
# Reddens: default-dashboard-access: "a plain member and a manager with no default of their own each read the admin’s dashboard as their default, and find it in their list marked as the workspace’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Get('workspace/:workspaceId/default')\n  @UseGuards(ResourceMemberGuard)\n"
b = "  @Get('workspace/:workspaceId/default')\n  @UseGuards(ResourceMemberGuard, PermissionsGuard)\n  @RequirePermissions('dashboard.workspace_default.manage')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dda-7-the-default-read-asks-the-key: the default read asks dashboard.workspace_default.manage')
