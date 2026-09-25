# CHANGING AN ITEM ASKS NOTHING OF THE TASK'S LEVEL.
# Reddens: task-rows-by-id: "a member in a view-only space changes none of a task’s checklists or its type there (403, unchanged) — where in an open space they make a checklist and tick an item"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertTaskWriteAccess(taskId, actorId)\n    const { item: existing } = await this.checklistItemOf(taskId, itemId)\n\n    // What an item's update may change"
b = "    const { item: existing } = await this.checklistItemOf(taskId, itemId)\n\n    // What an item's update may change"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("trb-13-items-changed-by-readers: changing an item asks nothing of the task's level")
