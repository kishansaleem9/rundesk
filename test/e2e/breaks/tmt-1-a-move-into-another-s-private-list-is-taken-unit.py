# `raf-8`'s edit, claimed by the unit test beside the service.
# Reddens: unit: task-move-target.test.ts "refuses another’s private list in an open space as the guard refuses it, 403 “This list is private”, and moves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (\n      !canSeePrivateItem(\n        { visibility: target.listVisibility, createdById: target.listCreatedById },\n        { userId: actorId, isManager: superAdmin || isManagerRole(membership?.role) },\n      )\n    ) {\n      throw new ForbiddenException('This list is private')\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tmt-1-a-move-into-another-s-private-list-is-taken-unit: a move asks no private-list rule')
