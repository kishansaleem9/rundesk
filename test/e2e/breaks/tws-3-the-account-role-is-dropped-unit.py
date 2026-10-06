# THE READ RULE IS ASKED WITH NO ROLE AT ALL: a super_admin who is a plain member is refused a private space's
# task they may open.
# Reddens: unit: task-write.test.ts "lets a super_admin who is a plain member change a task in a private space they are not in"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) {\n'
b = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account ? undefined : undefined }))) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tws-3-the-account-role-is-dropped-unit: the read rule is asked with no role')
