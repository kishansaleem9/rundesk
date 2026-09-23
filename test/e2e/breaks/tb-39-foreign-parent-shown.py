# GETTASK'S PARENT AS IT WAS: whatever the row names, shown by title.
# Reddens: task-boundaries: "a task whose parent row points into another workspace shows no parent — while one whose parent is its own does"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          .where(and(eq(tasks.id, row.parentTaskId), eq(spaces.workspaceId, homeWorkspaceId)))\n'
b = '          .where(eq(tasks.id, row.parentTaskId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-39-foreign-parent-shown: applied")
