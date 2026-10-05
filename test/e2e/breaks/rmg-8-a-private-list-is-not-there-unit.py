# `raf-2`'s edit, claimed by the guard's unit test.
# Reddens: unit: resource-member.guard.test.ts "a member refused a private list is answered 403 “This list is private”"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "        throw new ForbiddenException('This list is private')\n"
b = "        throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rmg-8-a-private-list-is-not-there-unit: the guard refuses a private list as not there')
