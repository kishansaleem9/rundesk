# THE BULK EDITOR ASKS EACH TASK ITS ESTIMATE, NOT THE REQUEST (`found-30-sep/task-estimate-below-zero`):
# an estimate below nought is answered 200 with every task under failed, not refused (400).
#
# Reddens: task-values: "the bulk editor refuses an estimate below nought (400) and changes no task (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if ('timeEstimate' in patch) assertEstimate(patch.timeEstimate)\n    if ('startDate' in patch && 'dueDate' in patch) assertDatesInOrder(patch.startDate, patch.dueDate, writerZone)\n",
     "    if ('startDate' in patch && 'dueDate' in patch) assertDatesInOrder(patch.startDate, patch.dueDate, writerZone)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-15-bulk-asks-each-task-its-estimate: the bulk request is not asked its estimate')
