# THE GUARD SAYS WHY AGAIN, TO A GUEST: 403 "This is not shared with you", so a guest learns which ids name
# something in the workspace.
# Reddens: refused-as-missing: "a guest is told an open task, list and space not shared with them are not there, as ids naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '      if (!(await guestMayRead(this.db, user.id, kind, id))) throw new NotFoundException(NOT_THERE)\n'
b = "      if (!(await guestMayRead(this.db, user.id, kind, id))) throw new ForbiddenException('This is not shared with you')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-4-a-guest-is-told-it-is-not-shared: the guard refuses a guest with 403')
