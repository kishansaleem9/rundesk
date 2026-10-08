# A date with no time whose day is changed in the sheet's date-and-time box is
# written as a time, local midnight (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`):
# the box shows such a date at 00:00, and a new day typed over it gave the task
# a time nobody chose.
#
# Reddens: unit: task-dates.test.ts "keeps a date with no time without one when its day is changed in the date-and-time box"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = "  if (clock?.startsWith('00:00') && !carriesTime(stored, storedHasTime)) {\n"
b = "  if (clock === 'never' && !carriesTime(stored, storedHasTime)) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('htf-6-a-new-day-in-the-time-box-gains-midnight-unit: a new day in the time box is a time')
