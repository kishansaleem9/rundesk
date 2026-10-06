# EVERY YEAR IS SENT TO POSTGRES (`found-5-oct/years-below-100-read-back-wrong`, as the review found it), asked of
# `taskDateFrom` itself: year 0, the year before it and one past 9999 are taken, for the database to refuse.
# Reddens: unit: task-date-input.test.ts "refuses, in words, a year Postgres cannot take as sent: 0, before it, past 9999"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-date-input.ts'
a = '  if (year < TASK_DATE_YEARS.first || year > TASK_DATE_YEARS.last) {\n'
b = '  if (year < TASK_DATE_YEARS.first - 1e9) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tdi-1-every-year-is-sent-unit: every year is taken')
