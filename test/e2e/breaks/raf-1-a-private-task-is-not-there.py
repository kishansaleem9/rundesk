# THE GUARD ANSWERS A PRIVATE TASK AS AN ID NAMING NOTHING, 404 "Resource not found" — what was decided on
# 30 September and reverted at the owner's request on 1 October (`found-30-sep/private-task-reads-say-403`):
# the member is no longer told why.
# Reddens: refused-as-forbidden: "a member refused a private task is told 403 “This task is private” — and an id naming nothing is 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "        throw new ForbiddenException('This task is private')\n"
b = "        throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-1-a-private-task-is-not-there: the guard refuses a private task as not there')
