# `ram-1`'s edit, claimed by the guard's unit test.
# Reddens: unit: resource-member.guard.test.ts "a member refused a private task is told it is not there, as for an id naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '          { userId: user.id, isManager, isAssignee: item.taskIsAssignee },\n        )\n      ) {\n        throw new NotFoundException(NOT_THERE)\n      }\n'
b = "          { userId: user.id, isManager, isAssignee: item.taskIsAssignee },\n        )\n      ) {\n        throw new ForbiddenException('This task is private')\n      }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rmg-2-a-private-task-says-it-is-there-unit: the guard refuses a private task with 403')
