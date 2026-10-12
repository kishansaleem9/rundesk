# EVERY ACCOUNT IS READ AS A SUPER_ADMIN: a plain member changes a task in somebody else's private list.
# Re-aimed 8 October: the write rule asks `taskReadAnswer`, refusing in the read's words (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
# Reddens: unit: task-write.test.ts "still refuses a plain member, whose account is no super_admin, the task in somebody else’s private list"
#
# Re-aimed 12 October: the call asks for the task where it lives (`, { atHome: true }`, Tasks in Multiple Lists).
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }, { atHome: true })\n'
b = "  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: 'super_admin' }, { atHome: true })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tws-2-everybody-a-super-admin-unit: every account is read as a super_admin')
