# THE GUARD ANSWERS A PRIVATE TASK 403 "This task is private" AGAIN (`found-30-sep/private-task-reads-say-403`).
#
# This file was `request-access-4-private-is-not-found-again`, which broke the OLD decision — 403 for a private
# task, so the card could key on it — by making it 404. That 404 is the decision now, so the patch is turned round:
# the refusal says the task is there, the card (keyed on the 404) is no longer drawn for it, and the first check
# to redden is the one that compares the refusal with an id naming nothing.
# Reddens: request-access: "the member is refused the private task with the 404 an id naming nothing gets, in the same words — the refusal says nothing about whether it is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '          { userId: user.id, isManager, isAssignee: item.taskIsAssignee },\n        )\n      ) {\n        throw new NotFoundException(NOT_THERE)\n      }\n'
b = "          { userId: user.id, isManager, isAssignee: item.taskIsAssignee },\n        )\n      ) {\n        throw new ForbiddenException('This task is private')\n      }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-4-a-private-task-says-it-is-there: the guard refuses a private task with 403')
