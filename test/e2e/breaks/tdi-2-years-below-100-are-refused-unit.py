# A YEAR BELOW 100 IS REFUSED (`found-5-oct/years-below-100-read-back-wrong`), asked of `taskDateFrom` itself: a
# range of the app's own choosing, where only what Postgres cannot take as sent is refused — year 2 and year 99,
# which it holds and which are read back as stored, among what this would refuse.
# Reddens: unit: task-date-input.test.ts "takes every year from 1 to 9999 as sent, year 2 and 99 among them"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-date-input.ts'
a = '  if (year < TASK_DATE_YEARS.first || year > TASK_DATE_YEARS.last) {\n'
b = '  if (year < 100 || year > TASK_DATE_YEARS.last) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tdi-2-years-below-100-are-refused-unit: years below 100 are refused')
