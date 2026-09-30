# THE GUARD REFUSES EVERY READ BY SOMEBODY BELOW A MANAGER, AS NOT THERE: every refusal check still passes, so
# the suite asks that what the member may open, they open. (Reads only: a refused write would stop the fixture,
# which makes the member's own task, before the check could run.)
# Reddens: refused-as-missing: "and what may be opened is: the member opens the open task, list, project and space and their own task, and the admin opens the private ones — so every refusal above is about the thing refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '    req.workspaceMember = { ...member, workspaceId, userId: user.id }\n    return true\n'
b = "    if (req.method === 'GET' && !isManagerRole(member.role as string)) throw new NotFoundException(NOT_THERE)\n    req.workspaceMember = { ...member, workspaceId, userId: user.id }\n    return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-12-only-managers-open-anything: the guard refuses every member')
