# GETTASK'S LABELS AS THEY WERE: any label assigned to the task, whoever's it is.
# Reddens: task-boundaries: "and its labels"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        .where(and(eq(taskLabelAssignments.taskId, taskId), eq(labels.workspaceId, homeWorkspaceId))),\n'
b = '        .where(eq(taskLabelAssignments.taskId, taskId)),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-42-foreign-labels-shown: applied")
