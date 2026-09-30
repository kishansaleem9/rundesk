# `ram-9`'s edit, claimed by the unit test beside the service.
# Reddens: unit: tasks-refused-reads.test.ts "refuses a list in a private space as a list that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      : null\n    if (!target) throw new NotFoundException('Target list not found')\n"
b = "      : null\n    if (!target) throw new ForbiddenException('You do not have access to that list')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-4-a-move-target-says-no-access-unit: a move’s target is refused with 403')
