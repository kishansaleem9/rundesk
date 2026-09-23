# THE CONVERT DIALOG OFFERS A SUBTASK AS A PARENT — which the server refuses.
# Reddens: task-pickers-search: "the convert dialog finds it — and never offers a subtask as a parent"
import io
p = '/home/user/rundesk/apps/web/src/components/task-convert-dialog.tsx'
a = '    .filter((c) => c.id !== taskId && !c.parentTaskId)\n'
b = '    .filter((c) => c.id !== taskId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-8-convert-offers-subtasks: applied")
