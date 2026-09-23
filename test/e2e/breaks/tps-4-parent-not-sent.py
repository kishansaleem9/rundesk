# THE LISTING AS IT WAS: no `parentTaskId`, so the convert picker cannot tell a subtask.
# Reddens: task-pickers-search: "a subtask says it is one, so the convert picker can leave it out"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        parentTaskId:      tasks.parentTaskId,\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-4-parent-not-sent: applied")
