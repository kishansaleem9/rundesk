# A CHECKLIST ITEM IS FOUND BY ITS ID ALONE, WHATEVER TASK THE URL NAMES.
# Reddens: task-rows-by-id: "somebody from another organisation, naming a task of their own, changes no checklist of another’s — no rename, no item added, edited, ticked, moved into theirs or deleted, no checklist deleted (404 each, all unchanged) — while the admin, on their own task, renames, adds and ticks"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .where(and(eq(taskChecklistItems.id, itemId), eq(taskChecklists.taskId, taskId)))\n'
b = '      .where(eq(taskChecklistItems.id, itemId))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('trb-2-item-found-anywhere: a checklist item is found by its id alone, whatever task the url names')
