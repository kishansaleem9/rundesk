# `raf-3`'s edit, claimed by the guard's unit test.
# Reddens: unit: resource-member.guard.test.ts "a member refused a private space is answered 403 “This space or project is private”"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      if (!ok) throw new ForbiddenException('This space or project is private')\n"
b = "      if (!ok) throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rmg-9-a-private-space-is-not-there-unit: the guard refuses a private space as not there')
