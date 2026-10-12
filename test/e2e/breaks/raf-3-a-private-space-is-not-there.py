# THE GUARD ANSWERS A PRIVATE SPACE, AND WHAT IS IN IT, AS AN ID NAMING NOTHING (404 "Resource not found"). The
# portals of its project are refused by the same line on their own route.
# Reddens: refused-as-forbidden: "a member refused a private space is told 403 “This space or project is private” for it and its project, list and task — and ids naming nothing are 404"
#   or "a client portal of a project the member may not open is refused, 403 “This space or project is private” — listing the project’s portals, or revoking one by id — and it stays; ids naming nothing are 404"
#
# Re-aimed 12 October: the guard gathers its refusal and throws it once (Tasks in Multiple Lists reads a task through a list it was added to).
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      if (!ok) refusal = 'This space or project is private'\n"
b = "      if (!ok) throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-3-a-private-space-is-not-there: the guard refuses a private space as not there')
