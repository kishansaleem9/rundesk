# THE BULK EDITOR REFUSES A REQUEST WHOSE TWO DATES ARE THE WRONG WAY ROUND, changing no task.
#
# Reddens: task-values: "the bulk editor changes every task it sets a start after its due date for, and every task it sends two dates the wrong way round, failing none (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      throw new BadRequestException('patch is required')\n    }\n",
     "      throw new BadRequestException('patch is required')\n    }\n    if (patch.startDate && patch.dueDate && new Date(patch.startDate).getTime() > new Date(patch.dueDate).getTime()) {\n      throw new BadRequestException('A task cannot start after it is due')\n    }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-24-bulk-refuses-two-dates-the-wrong-way-round: the bulk editor refuses two dates the wrong way round')
