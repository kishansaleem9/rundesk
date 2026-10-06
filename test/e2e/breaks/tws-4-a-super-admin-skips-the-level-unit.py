# A SUPER_ADMIN IS LET PAST THE SPACE'S LEVEL: a view-only space's task is changed by a super_admin member.
# Re-aimed 6 October: the mail comment rule now reads the account the same way (`found-6-oct/mail-comments-read-the-workspace-role`).
# Reddens: unit: task-write.test.ts "still asks a super_admin who is a plain member the space’s level"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) {\n'
b = "  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n  if (account?.role === 'super_admin') return ctx\n  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tws-4-a-super-admin-skips-the-level-unit: a super_admin skips the space’s level')
