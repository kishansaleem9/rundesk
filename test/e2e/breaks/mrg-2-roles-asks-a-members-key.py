# MAKING A CUSTOM ROLE ASKS A KEY EVERY MEMBER HOLDS: a manager makes a role holding every key.
# Reddens: member-role-grants: "a manager makes no custom role and assigns none, themself included (403 each, none made, none held)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.controller.ts'
a = "  @Post()\n  // Every write here asks `roles.manage`, and within the actor's own permissions (the service):\n  // `WorkspaceAdminGuard` admitted managers, who made and took roles holding\n  // every key (`managers-grant-themselves-admin`).\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('roles.manage')\n"
b = "  @Post()\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('report.view.basic')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mrg-2-roles-asks-a-members-key: making a role asks report.view.basic')
