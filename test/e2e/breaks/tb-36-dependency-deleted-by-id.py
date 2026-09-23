# REMOVEDEPENDENCY AS IT WAS: the dependency's id alone, from any task's route.
# Reddens: task-boundaries: "and a dependency in another workspace cannot be deleted through a task of your own — the route took its id alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.relatedTaskId, taskId)),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-36-dependency-deleted-by-id: applied")
