# A YEAR BELOW 1000 IS WRITTEN WITHOUT ITS LEADING ZEROS (`found-5-oct/years-below-100-read-back-wrong`): `2-10-06`,
# a value no date box can hold.
# Reddens: unit: task-dates.test.ts "is shown with four digits, written as that year, and moved within it"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = "const padYear = (y: number) => String(y).padStart(4, '0')\n"
b = 'const padYear = (y: number) => String(y)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ybr-5-a-date-box-shows-year-2-as-2-unit: year 2 is written 2-10-06')
