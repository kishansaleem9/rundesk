# A MOVE COUNTS ONLY THE WORKSPACE ROLE: a super_admin who is a plain member of the workspace opens another
# member's private list through the guard, and is refused moving a task into it.
# Reddens: unit: task-move-target.test.ts "and moves a super_admin’s task into another’s private list, as the guard lets a super_admin open it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        { userId: actorId, isManager: superAdmin || isManagerRole(membership?.role) },\n"
b = "        { userId: actorId, isManager: isManagerRole(membership?.role) },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tmt-4-a-super-admin-is-refused-a-private-list-unit: a move counts a super_admin as a plain member')
