# POST /TASKS REFUSES A TASK THAT STARTS AFTER IT IS DUE, as it did between 30 September and the
# owner's decision of 1 October. Also reddens the create modal's check, which makes its task through this route.
#
# Reddens: task-values: "POST /tasks makes a task that starts after it is due, holding both dates as sent (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return this.tasks.createTask({\n',
     "    if (body.startDate && body.dueDate && new Date(body.startDate).getTime() > new Date(body.dueDate).getTime()) {\n      throw new BadRequestException('A task cannot start after it is due')\n    }\n    return this.tasks.createTask({\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-22-post-refuses-a-start-after-the-due: POST /tasks refuses a start after the due date')
