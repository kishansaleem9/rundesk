# A YEAR POSTGRES CANNOT HOLD AS SENT GOES TO POSTGRES (`found-5-oct/years-below-100-read-back-wrong`, as the
# review found it): year 0, the year before it and one past 9999 are sent, refused by the database, and answered
# 500 by PATCH and POST and with the database's own words by the bulk editor.
# Reddens: task-values: "a date Postgres cannot hold as sent is refused in words and nothing is written: year 0, the year before it and one past 9999 are each answered 400 by PATCH /tasks/:id, the bulk editor and POST /tasks — “must fall between the years 1 and 9999” where the route reads the date itself — the task keeps its dates and no task is made (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-date-input.ts'
a = '  if (year < TASK_DATE_YEARS.first || year > TASK_DATE_YEARS.last) {\n'
b = '  if (year < TASK_DATE_YEARS.first - 1e9) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-values-45-a-year-postgres-cannot-hold-is-sent: every year is sent to Postgres')
