# `ram-5`'s edit, claimed by the guard's unit test.
# Reddens: unit: resource-member.guard.test.ts "a non-member resolving via spaceId is told it is not there, as for an id naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      if (resolved.namedWorkspace) throw new ForbiddenException('You are not a member of this workspace')\n      throw new NotFoundException(NOT_THERE)\n"
b = "      if (resolved.namedWorkspace) throw new ForbiddenException('You are not a member of this workspace')\n      throw new ForbiddenException('You are not a member of this workspace')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rmg-1-a-stranger-is-told-it-is-somebody-elses-unit: the guard refuses a stranger with 403')
