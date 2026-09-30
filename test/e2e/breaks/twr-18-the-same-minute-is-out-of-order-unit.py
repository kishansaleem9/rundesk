# THE CREATE MODAL READS A START AT THE DUE MINUTE AS AFTER IT.
#
# Reddens: unit: task-dates.test.ts "is out of order only when both are set and the start is after the due, to the minute"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return Number.isFinite(s) && Number.isFinite(d) && s > d\n',
     '  return Number.isFinite(s) && Number.isFinite(d) && s >= d\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-18-the-same-minute-is-out-of-order-unit: the same minute is out of order')
