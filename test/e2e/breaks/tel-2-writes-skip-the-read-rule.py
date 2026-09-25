# A TASK IS CHANGED WITHOUT BEING READABLE: a private list's task by a member its space lets edit.
# Reddens: task-edit-levels: "a task the member cannot open is not theirs to change, whatever the space lets them do — the admin changes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (!(await readableTask(this.db, ctx.workspaceId, taskId, { id: actorId, role: membership.role }))) {\n'
b = "    if (!(await readableTask(this.db, ctx.workspaceId, taskId, { id: actorId, role: membership.role })) && actorId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tel-2-writes-skip-the-read-rule: writes skip the read rule')
