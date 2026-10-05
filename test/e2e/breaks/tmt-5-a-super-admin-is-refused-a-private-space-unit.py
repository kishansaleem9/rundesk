# A MOVE ASKS A SUPER_ADMIN THE CONTAINER RULE: a super_admin who is a plain member of the workspace opens a
# private space's list through the guard, and makes a task there, and is refused moving a task into it.
# Reddens: unit: task-move-target.test.ts "and moves a super_admin’s task into a list of a private space they are not in, as the guard lets them open it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (!superAdmin && !(await checkContainerAccess(this.db, target, { userId: actorId, workspaceRole: membership?.role }))) {\n"
b = "    if (!(await checkContainerAccess(this.db, target, { userId: actorId, workspaceRole: membership?.role }))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tmt-5-a-super-admin-is-refused-a-private-space-unit: a move asks a super_admin the container rule')
