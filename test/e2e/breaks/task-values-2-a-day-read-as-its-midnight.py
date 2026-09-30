# A DAY WITH NO TIME IS READ AS ITS UTC MIDNIGHT (`found-30-sep/a-task-starts-after-it-is-due`):
# the rule compares every pair as two moments, so a task due "the 4th" with no time, starting at
# 15:00 on the 4th, is refused as starting after it is due.
#
# Reddens: task-values: "while a task starting before it is due is made, and so is one starting at 15:00 on a day it is due with no time given — the day holds the moment"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (startDay === dueDay) return s > d\n',
     '  return s > d\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-2-a-day-read-as-its-midnight: a day beside a moment is compared as its midnight')
