# THE RANK IS ASKED OF NOBODY: a member granted members.role.change makes somebody an admin, and a manager adds one.
# Reddens: member-role-grants: "a member granted roles.manage makes a role only of permissions they hold, assigns none holding more, and with members.role.change makes nobody an admin — while changing a member within their own rank"
#   or "nobody is added under a role a workspace does not give (400, no row), and a manager adds nobody as an admin (403, no row) — though they add a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "    const above = roles.filter((r): r is string => !!r && roleRank(r) > mine)\n"
b = "    const above: string[] = []\n    void roles\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mrg-4-rank-asked-of-nobody: nothing is ever above the actor')
