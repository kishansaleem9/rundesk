# EVERY ACCOUNT IS READ AS A SUPER_ADMIN: a plain member changes a task in somebody else's private list.
# Reddens: unit: task-write.test.ts "still refuses a plain member, whose account is no super_admin, the task in somebody else’s private list"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) {\n'
b = "  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: 'super_admin' }))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tws-2-everybody-a-super-admin-unit: every account is read as a super_admin')
