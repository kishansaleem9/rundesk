# A MOVE ASKS NOTHING OF ITS TARGET'S CONTAINERS: a member moves their task into a list in a private space they
# are not in (`tb-11`'s edit, claimed by the unit test beside the service).
# Reddens: unit: task-move-target.test.ts "refuses a list in a private space, 403 “You do not have access to that list”, and moves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      throw new ForbiddenException('You do not have access to that list')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tmt-2-a-move-into-a-private-space-is-taken-unit: a move asks no container rule')
