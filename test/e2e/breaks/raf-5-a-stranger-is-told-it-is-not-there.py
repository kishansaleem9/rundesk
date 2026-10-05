# THE GUARD ANSWERS A USER OF ANOTHER ORGANISATION AS AN ID NAMING NOTHING (404 "Resource not found") — and a
# route naming the workspace, which is not looked up, says so for every id.
# Reddens: refused-as-forbidden: "a user of another organisation is told 403 “You are not a member of this workspace” for this workspace’s task, list, project and space — and ids naming nothing are 404"
#   or "a route naming the workspace itself refuses a stranger 403 — alike for this workspace and for an id naming none, since it is not looked up — and names nothing in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "    if (!member) throw new ForbiddenException('You are not a member of this workspace')\n"
b = "    if (!member) throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-5-a-stranger-is-told-it-is-not-there: the guard refuses a stranger as not there')
