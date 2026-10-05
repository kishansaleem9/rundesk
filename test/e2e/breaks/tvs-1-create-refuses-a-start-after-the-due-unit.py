# CREATETASK REFUSES A START AFTER THE DUE DATE AND AN ESTIMATE BELOW NOUGHT.
#
# Reddens: unit: task-writes.test.ts "makes a task that starts after it is due, with an estimate below nought, writing both as sent"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    await this.assertCanCreateTaskIn(data.listId, data.createdById)\n',
     "    await this.assertCanCreateTaskIn(data.listId, data.createdById)\n    if (data.startDate && data.dueDate && new Date(data.startDate).getTime() > new Date(data.dueDate).getTime()) {\n      throw new BadRequestException('A task cannot start after it is due')\n    }\n    if (typeof data.timeEstimate === 'number' && data.timeEstimate < 0) throw new BadRequestException('timeEstimate must not be below 0')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tvs-1-create-refuses-a-start-after-the-due-unit: createTask refuses them')
