# PATCH /TASKS/:ID REFUSES AN ESTIMATE BELOW NOUGHT.
#
# Reddens: task-values: "PATCH /tasks/:id takes an estimate below nought and stores it (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return this.tasks.updateTask(taskId, user.id, patch)\n',
     "    if (typeof patch.timeEstimate === 'number' && patch.timeEstimate < 0) throw new BadRequestException('timeEstimate must not be below 0')\n    return this.tasks.updateTask(taskId, user.id, patch)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-30-patch-refuses-an-estimate-below-nought: PATCH refuses an estimate below nought')
