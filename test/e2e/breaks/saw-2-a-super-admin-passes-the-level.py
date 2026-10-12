# A SUPER_ADMIN IS LET PAST THE SPACE'S LEVEL AS WELL AS THE READ RULE: in a view-only space, a super_admin who
# is a plain member changes what its members may only view.
# Re-aimed 6 October: the mail comment rule now reads the account the same way (`found-6-oct/mail-comments-read-the-workspace-role`).
# Re-aimed 8 October: the write rule asks `taskReadAnswer`, refusing in the read's words (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
# Reddens: super-admin-task-writes: "the space’s level is still asked of a super_admin who is a plain member: in a view-only space they open the task and are refused its change, 403 saying why, the title kept"
#
# Re-aimed 12 October: the call asks for the task where it lives (`, { atHome: true }`, Tasks in Multiple Lists).
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n  // Where it lives: a task read through a list it was added to is not changed from there.\n  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }, { atHome: true })\n'
b = "  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)\n  if (account?.role === 'super_admin') return ctx\n  // Where it lives: a task read through a list it was added to is not changed from there.\n  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }, { atHome: true })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('saw-2-a-super-admin-passes-the-level: a super_admin skips the space’s level')
