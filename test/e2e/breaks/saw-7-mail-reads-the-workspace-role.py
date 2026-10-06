# A COMMENT MAILED BY A SUPER_ADMIN WHO IS A PLAIN MEMBER IS REFUSED: the mail rule reads the workspace role. (`found-6-oct/mail-comments-read-the-workspace-role`)
# Reddens: super-admin-task-writes: "and a comment they mail to that task’s address lands as theirs, as the one they made in the app — while the plain member, refused the private space, is refused by mail too and nothing of theirs is written (SQL)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = '  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) return false\n'
b = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: membership.role }))) return false\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('saw-7-mail-reads-the-workspace-role: the mail comment rule reads the workspace role again')
