# THE GUARD ANSWERS A PRIVATE LIST, AND WHAT IS IN IT, AS AN ID NAMING NOTHING (404 "Resource not found").
# Reddens: refused-as-forbidden: "a member refused a private list is told 403 “This list is private” for it, its task and its tasks’ listing — and ids naming nothing are 404"
#
# Re-aimed 12 October: the guard gathers its refusal and throws it once (Tasks in Multiple Lists reads a task through a list it was added to).
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      refusal = 'This list is private'\n"
b = "      throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-2-a-private-list-is-not-there: the guard refuses a private list as not there')
