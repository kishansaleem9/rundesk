# PATCH /TASKS/:ID REFUSES TWO DATES SENT THE WRONG WAY ROUND.
#
# Reddens: task-values: "PATCH /tasks/:id takes a start moved past the due date the task holds, a due date moved before its start, and both sent the wrong way round (200 each), holding each as sent (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return this.tasks.updateTask(taskId, user.id, patch)\n',
     "    if (patch.startDate instanceof Date && patch.dueDate instanceof Date && patch.startDate > patch.dueDate) {\n      throw new BadRequestException('A task cannot start after it is due')\n    }\n    return this.tasks.updateTask(taskId, user.id, patch)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-23-patch-refuses-a-start-after-the-due: PATCH refuses a start after the due date')
