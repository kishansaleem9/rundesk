# THE WRITE RULE ASKS THE READ RULE WITH THE WORKSPACE ROLE AGAIN, which is never super_admin: a super_admin who
# is a plain member opens a task in a private list or space and every change of it is "not found".
# Re-claimed 6 October: the task's other edits (a subtask, an assignee, a follower, a blocked task) ask the write rule too.
# Re-aimed 8 October: the write rule asks `taskReadAnswer`, refusing in the read's words (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
# Reddens: super-admin-task-writes: "a super_admin who is a plain member moves their task into a member’s private list, opens it there, renames it and moves it back — each change made (SQL)"
#   or "a task they made in a private space they are not in, they open, comment on and rename (SQL) — and the task sheet is offered its edits"
#   or "and the private space’s task takes the super_admin’s other edits too — a subtask under it, themself as its assignee and follower, another task blocked by it (each made, SQL) — and its files and linked docs are listed to them (200)"
#   or "and so does a task in another member’s private list, and a task made there assigned to themself (SQL)"
#
# Re-aimed 12 October: the call asks for the task where it lives (`, { atHome: true }`, Tasks in Multiple Lists).
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }, { atHome: true })\n'
b = '  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account ? membership.role : null }, { atHome: true })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('saw-1-the-write-rule-reads-the-workspace-role: the write rule asks with the workspace role')
