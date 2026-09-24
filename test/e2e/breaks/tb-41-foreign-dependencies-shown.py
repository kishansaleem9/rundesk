# GETTASK'S DEPENDENCIES AS THEY WERE: every related task, handed back whole.
#
# RE-AIMED 24 September, at a unit claim. Aimed at the route, it reddened
# nothing (lanes 3 and 4, the second drifted plan): every route reads a task
# with a reader now, and the reader rule (`readableTaskIds`, in the task's own
# workspace) leaves a foreign related task out by itself. This condition is the
# only rule a readerless internal caller has, so the unit test reads the query.
# Reddens: unit: tasks-security.test.ts "reads a task’s dependencies from its own workspace only, with no reader as with one"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        .where(and(eq(taskDependencies.taskId, taskId), eq(spaces.workspaceId, homeWorkspaceId))),\n'
b = '        .where(eq(taskDependencies.taskId, taskId)),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-41-foreign-dependencies-shown: applied")
