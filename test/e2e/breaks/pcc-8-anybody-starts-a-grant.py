# THE PERSONAL CONNECT ASKS NO MEMBERSHIP: somebody outside the workspace is handed a grant in it.
# Reddens: personal-calendar-connect: "somebody outside the workspace cannot start a grant in it — its member can"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)\n  @Post('workspaces/:workspaceId/calendar-sync/connect/:provider')\n"
b = "  @UseGuards(JwtAuthGuard)\n  @Post('workspaces/:workspaceId/calendar-sync/connect/:provider')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-8-anybody-starts-a-grant: the personal connect asks no membership')
