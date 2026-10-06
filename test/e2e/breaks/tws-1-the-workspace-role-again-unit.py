# THE WRITE RULE HANDS THE READ RULE THE WORKSPACE ROLE AGAIN: a super_admin who is a plain member is refused a
# private list's task they may open.
# Reddens: unit: task-write.test.ts "lets a super_admin who is a plain member change a task in a private list they may open"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) {\n'
b = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account ? membership.role : null }))) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tws-1-the-workspace-role-again-unit: the write rule asks with the workspace role')
