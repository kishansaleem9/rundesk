# THE READ RULE IS ASKED WITH NO ROLE AT ALL: a super_admin who is a plain member is refused a private space's
# task they may open.
# Re-aimed 8 October: the write rule asks `taskReadAnswer`, refusing in the read's words (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
# Reddens: unit: task-write.test.ts "lets a super_admin who is a plain member change a task in a private space they are not in"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role })\n'
b = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account ? undefined : undefined })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tws-3-the-account-role-is-dropped-unit: the read rule is asked with no role')
