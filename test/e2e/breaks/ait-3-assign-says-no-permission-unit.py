# `atr-7`'s edit, claimed by the unit test beside the service.
# Reddens: unit: task-readable.test.ts "answers a member refused it, and a user of another organisation, word for word as an id naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (!(await readableTask(this.db, row.workspaceId, taskId, { id: actorId }))) return refuseAssign('unknown_task')\n"
b = "    if (!(await this.memberRole(row.workspaceId, actorId))) return refuseAssign('no_permission')\n    if (!(await readableTask(this.db, row.workspaceId, taskId, { id: actorId }))) return refuseAssign('no_permission')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ait-3-assign-says-no-permission-unit: Assign with AI says no_permission for a task its asker may not open')
