# A DUE DAY WITH NO TIME BOUNDS THE START AT ITS MIDNIGHT, so the picker offers no start that day.
#
# Reddens: unit: task-dates.test.ts "bounds the start box by the due moment, or by the end of a due day with no time on it"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return isDateOnly(d) ? `${toDateInput(dueIso)}T23:59` : toDateTimeInput(dueIso)\n',
     '  return toDateTimeInput(dueIso)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-19-a-due-day-bounds-the-start-at-midnight-unit: a due day bounds the start at 00:00')
