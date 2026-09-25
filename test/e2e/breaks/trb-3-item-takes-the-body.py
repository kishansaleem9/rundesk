# AN ITEM'S UPDATE WRITES THE WHOLE BODY AGAIN, `checklistId` INCLUDED.
# Reddens: task-rows-by-id: "an item’s update changes an item’s own fields, and a `checklistId` in the body moves it nowhere — its words change, its checklist stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    for (const key of ['content', 'isDone', 'position', 'dueDate', 'assigneeId'] as const) {\n      if (key in patch) set[key] = patch[key]\n    }\n"
b = '    Object.assign(set, patch)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("trb-3-item-takes-the-body: an item's update writes the whole body again, `checklistid` included")
