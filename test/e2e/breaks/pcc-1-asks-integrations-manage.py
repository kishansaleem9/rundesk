# A PERSON'S CALENDAR CONNECT ASKS `integrations.manage` AGAIN: a member and a guest are refused their own calendar.
# Reddens: personal-calendar-connect: "a member is answered with Google’s consent address, for their own calendar — its signed state names them, this workspace, and a personal grant"
#   or "a guest may connect their own calendar too — ClickUp gives guests and limited members the calendar integrations"
#   or "the member’s \"Add account\" takes them to Google with their own grant, and one that failed is said on the Accounts page until it is closed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)\n  @Post('workspaces/:workspaceId/calendar-sync/connect/:provider')\n"
b = "  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('integrations.manage')\n  @Post('workspaces/:workspaceId/calendar-sync/connect/:provider')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-1-asks-integrations-manage: the personal connect asks integrations.manage')
