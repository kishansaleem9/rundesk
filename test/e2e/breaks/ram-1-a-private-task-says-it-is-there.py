# THE GUARD SAYS WHY AGAIN, FOR A PRIVATE TASK (`found-30-sep/private-task-reads-say-403`): 403 "This task is private"
# where an id naming nothing is 404, so the refusal tells whoever holds the id that it names a task.
# Reddens: refused-as-missing: "a member refused a private task is told it is not there — the 404 an id naming nothing gets, in the same words"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '          { userId: user.id, isManager, isAssignee: item.taskIsAssignee },\n        )\n      ) {\n        throw new NotFoundException(NOT_THERE)\n      }\n'
b = "          { userId: user.id, isManager, isAssignee: item.taskIsAssignee },\n        )\n      ) {\n        throw new ForbiddenException('This task is private')\n      }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-1-a-private-task-says-it-is-there: the guard refuses a private task with 403')
