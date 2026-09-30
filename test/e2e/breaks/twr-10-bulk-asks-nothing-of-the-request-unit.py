# THE BULK EDITOR ASKS NOTHING OF THE WHOLE REQUEST: an estimate below nought and two dates the
# wrong way round reach every task.
#
# Reddens: unit: task-writes.test.ts "refuses an estimate below nought, or two dates the wrong way round, before any task is changed"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if ('timeEstimate' in patch) assertEstimate(patch.timeEstimate)\n    if ('startDate' in patch && 'dueDate' in patch) assertDatesInOrder(patch.startDate, patch.dueDate, writerZone)\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-10-bulk-asks-nothing-of-the-request-unit: the bulk request is asked nothing')
