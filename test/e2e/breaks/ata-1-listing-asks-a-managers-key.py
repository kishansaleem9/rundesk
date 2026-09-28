# THE WORKSPACE'S ARCHIVED TASKS ASK A MANAGER'S KEY, AS WorkspaceAdminGuard DID: a plain member reads none of them.
# Reddens: archived-tasks-access: "a plain member reads the workspace’s archived tasks (200): those of the open and view-only spaces, and not the one in a private space they are not in"
#   or "each archived row says whether its reader may restore it: the member the open space’s and not the view-only one’s, the admin all three, the manager none (they belong to none of these spaces)"
#   or "Settings offers a plain member its Archived tab, listing the open space’s archived task with Restore and never the private space’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(WorkspaceMemberGuard)\n  @ApiOperation({ summary: 'List archived tasks in the workspace (Plan §13.4)' })"
b = "  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('members.invite')\n  @ApiOperation({ summary: 'List archived tasks in the workspace (Plan §13.4)' })"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-1-listing-asks-a-managers-key: GET archived-tasks asks members.invite')
