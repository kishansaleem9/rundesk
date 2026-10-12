# THE WRITE RULE HANDS THE READ RULE THE WORKSPACE ROLE AGAIN: a super_admin who is a plain member is refused a
# private list's task they may open.
# Re-aimed 8 October: the write rule asks `taskReadAnswer`, refusing in the read's words (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
# Reddens: unit: task-write.test.ts "lets a super_admin who is a plain member change a task in a private list they may open"
#
# Re-aimed 12 October: the call asks for the task where it lives (`, { atHome: true }`, Tasks in Multiple Lists).
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }, { atHome: true })\n'
b = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account ? membership.role : null }, { atHome: true })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tws-1-the-workspace-role-again-unit: the write rule asks with the workspace role')
