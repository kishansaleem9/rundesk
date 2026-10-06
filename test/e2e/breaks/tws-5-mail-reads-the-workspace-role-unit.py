# THE MAIL COMMENT RULE READS THE WORKSPACE ROLE. (`found-6-oct/mail-comments-read-the-workspace-role`)
# Reddens: unit: task-write.test.ts "lets a super_admin who is a plain member comment by mail on a task in a private space they are not in, as in the app; a plain member still may not"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = '  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) return false\n'
b = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: membership.role }))) return false\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tws-5-mail-reads-the-workspace-role-unit: the mail comment rule reads the workspace role again')
