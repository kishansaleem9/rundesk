# A BULK EDIT'S OWN TWO DATES ARE NOT ASKED OF THE REQUEST (`found-30-sep/a-task-starts-after-it-is-due`):
# two dates the wrong way round are refused task by task (200, all under failed), not whole.
#
# Reddens: task-values: "and a bulk edit whose own two dates are the wrong way round is refused whole (400, saying so), changing no task"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if ('startDate' in patch && 'dueDate' in patch) assertDatesInOrder(patch.startDate, patch.dueDate, writerZone)\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-6-bulk-asks-each-task-alone: the bulk request is not asked its own dates')
