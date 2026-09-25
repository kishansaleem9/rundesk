# CHANGING A ROLE ASKS WorkspaceAdminGuard AGAIN, which admits managers: a manager makes themself an admin.
# Reddens: member-role-grants: "a manager changes nobody’s role — not their own to admin, not a member’s (403 each, both unchanged) — and the admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = "  @Patch(':workspaceId/members/:userId')\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('members.role.change')\n"
b = "  @Patch(':workspaceId/members/:userId')\n  @UseGuards(WorkspaceAdminGuard)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mrg-1-role-change-asks-the-admin-guard: a role change asks the admin guard')
