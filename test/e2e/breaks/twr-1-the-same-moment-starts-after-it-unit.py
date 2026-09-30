# THE SAME MOMENT, OR THE SAME DAY, COUNTS AS STARTING AFTER IT IS DUE.
#
# Reddens: unit: task-values.test.ts "compares two moments as moments and two days as days: a start after the due is found, the same day is not"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (startDay === dueDay) return s > d\n',
     '  if (startDay === dueDay) return s >= d\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-1-the-same-moment-starts-after-it-unit: the same moment is out of order')
