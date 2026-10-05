# THE GUARD ANSWERS A GUEST WHAT IS NOT SHARED WITH THEM AS AN ID NAMING NOTHING (404 "Resource not found").
# Reddens: refused-as-forbidden: "a guest is told 403 “This is not shared with you” for an open task, list and space not shared with them — and ids naming nothing are 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      if (!(await guestMayRead(this.db, user.id, kind, id))) throw new ForbiddenException('This is not shared with you')\n"
b = "      if (!(await guestMayRead(this.db, user.id, kind, id))) throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-4-a-guest-is-told-it-is-not-there: the guard refuses a guest as not there')
