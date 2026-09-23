# PUTTING SOMEBODY ELSE ON A TASK TREATED AS FOLLOWING IT YOURSELF: reading the
# task becomes enough to add or remove anyone.
# Reddens: task-boundaries: "but putting somebody else on it is an edit, refused to a member who may only read the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (userId !== actorId) await this.assertTaskWriteAccess(taskId, actorId)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-20-anyone-may-add-others: applied")
