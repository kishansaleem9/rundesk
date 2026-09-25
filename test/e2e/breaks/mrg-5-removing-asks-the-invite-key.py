# REMOVING A MEMBER ASKS THE KEY A MANAGER HOLDS: a manager removes members.
# Reddens: member-role-grants: "a manager removes nobody from the workspace (403, still a member) — and the admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = "  @RequirePermissions('members.remove')\n"
b = "  @RequirePermissions('members.invite')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mrg-5-removing-asks-the-invite-key: removing asks members.invite')
