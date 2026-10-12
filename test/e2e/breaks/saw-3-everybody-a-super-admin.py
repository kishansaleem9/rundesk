# EVERY ACCOUNT IS READ AS A SUPER_ADMIN BY THE WRITE RULE: a plain member changes a private space's task they may
# not open (`PATCH` has no route guard in front of the rule).
# Re-aimed 8 October: the write rule asks `taskReadAnswer`, refusing in the read's words (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
# Reddens: super-admin-task-writes: "and a plain member is still refused the private space’s task — its read 403, its change refused and not made (SQL) — while its owner changes it"
#
# Re-aimed 12 October: the call asks for the task where it lives (`, { atHome: true }`, Tasks in Multiple Lists).
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }, { atHome: true })\n'
b = "  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account ? 'super_admin' : null }, { atHome: true })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('saw-3-everybody-a-super-admin: every account is read as a super_admin')
