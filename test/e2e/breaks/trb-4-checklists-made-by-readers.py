# MAKING A CHECKLIST ASKS NOTHING OF THE TASK’S LEVEL.
# Reddens: task-rows-by-id: "a member in a view-only space changes none of a task’s checklists or its type there (403, unchanged) — where in an open space they make a checklist and tick an item"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '  async createChecklist(taskId: string, title: string, actorId: string) {\n    await this.assertTaskWriteAccess(taskId, actorId)\n'
b = '  async createChecklist(taskId: string, title: string, actorId: string) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('trb-4-checklists-made-by-readers: making a checklist asks nothing of the task’s level')
