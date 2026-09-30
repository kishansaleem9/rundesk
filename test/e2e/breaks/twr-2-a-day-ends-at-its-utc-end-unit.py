# A DAY WITH NO TIME ENDS AT ITS UTC END, not twelve hours later for the western zones.
#
# Reddens: unit: task-values.test.ts "finds a day beside a moment after it only where every reader would, and never a date that is missing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const latestDue = dueDay ? d + DAY + 12 * HOUR : d\n',
     '  const latestDue = dueDay ? d + DAY : d\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-2-a-day-ends-at-its-utc-end-unit: a due day ends at its UTC midnight')
