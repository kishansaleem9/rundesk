# A MEMBER IS ADDED UNDER ANY ROLE STRING, as before: a membership holding the platform's own role is made.
# Reddens: member-role-grants: "nobody is added under a role a workspace does not give (400, no row), and a manager adds nobody as an admin (403, no row) — though they add a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "    if (!isAssignableWorkspaceRole(role)) {\n      throw new BadRequestException(`Invalid role. Must be one of: ${ASSIGNABLE_WORKSPACE_ROLES.join(', ')}`)\n    }\n    await this.assertWithinRank(workspaceId, actor, [role], 'add a member as')\n"
b = "    await this.assertWithinRank(workspaceId, actor, [role], 'add a member as')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mrg-6-any-role-added: an added role is not validated')
