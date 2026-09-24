# CHANGING ASSIGNEES NEEDS "EDIT": a "comment" space's assignee cannot hand their task on.
# Reddens: task-space-levels: "an assignee in a “comment” space may add a colleague to their task — in a “view only” space not (403, not added)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "  async addAssignee(taskId: string, userId: string, actorId: string) {\n    await this.assertTaskWriteAccess(taskId, actorId, { level: 'comment' })\n"
b = '  async addAssignee(taskId: string, userId: string, actorId: string) {\n    await this.assertTaskWriteAccess(taskId, actorId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsl-4-assigning-needs-edit: applied")
