# A DAY PICKED IN YEAR 2 IS WRITTEN AS 1902 (`found-5-oct/years-below-100-read-back-wrong`): `Date.UTC(2, …)`, as
# `withDatePart` built a date-only day, takes a year of 0–99 as 1900–1999.
# Reddens: unit: task-dates.test.ts "is shown with four digits, written as that year, and moved within it"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = '  at.setUTCFullYear(y, m, d)\n'
b = '  at.setTime(Date.UTC(y, m, d))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ybr-6-a-picked-day-in-year-2-is-1902-unit: a date-only day in year 2 is written as 1902')
