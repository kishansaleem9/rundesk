# `updateTask` ASKS ONLY THE DATES SENT, not the one the task keeps: a start moved past the due
# date the task holds is written.
#
# Reddens: unit: task-writes.test.ts "refuses one date moved past the other it holds, both sent the wrong way round, and an estimate below nought — and changes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        'startDate' in patch ? patch.startDate : before.startDate,\n",
     '        patch.startDate,\n'),
    ("        'dueDate' in patch ? patch.dueDate : before.dueDate,\n",
     '        patch.dueDate,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-9-patch-asks-only-the-dates-it-sends-unit: updateTask ignores the date the task holds')
