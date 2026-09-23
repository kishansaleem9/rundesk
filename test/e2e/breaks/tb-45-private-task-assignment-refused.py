# THE FIRST VERSION OF THE ASSIGNEE RULE, PUT BACK: an assignee judged by whether
# they could see the task BEFORE being assigned. A private task can then never be
# shared by assigning it — the flow comment-recording draws, which the regression
# run caught this rule breaking.
# Reddens: task-boundaries: "but a PRIVATE task is shared by assigning it — the member it could not be shown to opens it once assigned"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      await this.assertTaskReadAccess(taskId, userId, { asAssignee: as === 'assignee' })\n"
b = "      await this.assertTaskReadAccess(taskId, userId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-45-private-task-assignment-refused: applied")
