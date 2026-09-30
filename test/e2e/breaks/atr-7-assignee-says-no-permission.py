# ASSIGN WITH AI SAYS "no_permission" FOR A TASK ITS ASKER MAY NOT OPEN, as it did, and asks the role first: a member
# refused the task, and a user of any other organisation, are told they may not assign it, where an id naming
# nothing is "unknown_task" — so the answer says the id is somebody's task.
# Reddens: ai-task-reads: "an assignee is suggested for no task the asker may not open — the private list’s, and this workspace’s task asked by a user of another organisation, are answered word for word as an id naming nothing, with no pick — and for one they read, it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (!(await readableTask(this.db, row.workspaceId, taskId, { id: actorId }))) return refuseAssign('unknown_task')\n"
b = "    if (!(await this.memberRole(row.workspaceId, actorId))) return refuseAssign('no_permission')\n    if (!(await readableTask(this.db, row.workspaceId, taskId, { id: actorId }))) return refuseAssign('no_permission')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atr-7-assignee-says-no-permission: Assign with AI says no_permission for a task its asker may not open')
