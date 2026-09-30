# A MOVE'S TARGET IS REFUSED 403 "You do not have access to that list" AGAIN, for a list the mover may not open and
# for one that is not there alike: a refusal, where a list that is not there should be not found.
# Reddens: refused-as-missing: "a member cannot move their task into another’s private list, or a list in a private space, and is told the list is not there, as for one that does not exist — the task stays in its list"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      : null\n    if (!target) throw new NotFoundException('Target list not found')\n"
b = "      : null\n    if (!target) throw new ForbiddenException('You do not have access to that list')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-9-a-move-target-says-no-access: a move’s target is refused with 403')
