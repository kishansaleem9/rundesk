# `raf-1`'s edit, claimed by the guard's unit test.
# Reddens: unit: resource-member.guard.test.ts "a member refused a private task is answered 403 “This task is private”"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "        throw new ForbiddenException('This task is private')\n"
b = "        throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rmg-7-a-private-task-is-not-there-unit: the guard refuses a private task as not there')
