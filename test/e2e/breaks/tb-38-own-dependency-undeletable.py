# A REMOVAL THAT ONLY FINDS THE OTHER END: the task's own dependencies cannot
# be removed through it.
# Reddens: task-boundaries: "while the task’s own dependency is removed through it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.relatedTaskId, taskId)),\n'
b = '          eq(taskDependencies.relatedTaskId, taskId),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-38-own-dependency-undeletable: applied")
