# THE TASK SHEET WRITES A YEAR WITHOUT ITS LEADING ZEROS (`found-5-oct/years-below-100-read-back-wrong`), as it
# did: year 2 as `2-10-06T09:00`, which a date box cannot hold, so a start stored in year 2 shows an empty box.
# Reddens: task-values: "and the task sheet shows that start as 0002-10-06 09:00, the date it holds, not 10 February 2006 or an empty box"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = "const padYear = (y: number) => String(y).padStart(4, '0')\n"
b = "const padYear = (y: number) => String(y)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-values-42-the-sheet-writes-a-year-without-its-zeros: year 2 is written 2-10-06')
