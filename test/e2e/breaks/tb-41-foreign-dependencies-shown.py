# GETTASK'S DEPENDENCIES AS THEY WERE: every related task, handed back whole.
# Reddens: task-boundaries: "and so are its dependencies — the related task is handed back whole, so a foreign one was a read of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        .where(and(eq(taskDependencies.taskId, taskId), eq(spaces.workspaceId, homeWorkspaceId))),\n'
b = '        .where(eq(taskDependencies.taskId, taskId)),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-41-foreign-dependencies-shown: applied")
