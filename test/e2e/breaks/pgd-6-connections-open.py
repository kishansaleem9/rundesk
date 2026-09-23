# CONNECTING AN INTEGRATION NEEDS NOTHING: any member reaches the provider.
# Reddens: permission-guards: "a plain member is refused before the provider is asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
a = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('integrations.manage')\n  @Post('workspaces/:workspaceId/integrations/connections/:provider/oauth/start')\n"
b = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)\n  @Post('workspaces/:workspaceId/integrations/connections/:provider/oauth/start')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-6-connections-open: applied")
