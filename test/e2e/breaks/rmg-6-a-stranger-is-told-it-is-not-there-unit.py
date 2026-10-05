# `raf-5`'s edit, claimed by the guard's unit test.
# Reddens: unit: resource-member.guard.test.ts "DENIES a non-member resolving via spaceId"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "    if (!member) throw new ForbiddenException('You are not a member of this workspace')\n"
b = "    if (!member) throw new NotFoundException('Resource not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rmg-6-a-stranger-is-told-it-is-not-there-unit: the guard refuses a stranger as not there')
