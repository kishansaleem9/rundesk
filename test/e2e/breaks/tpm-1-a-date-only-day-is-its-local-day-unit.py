# A DATE-ONLY DAY IS DRAWN ON THE LOCAL DAY OF ITS UTC MIDNIGHT (`found-5-oct/timeline-press-moves-dates`), asked of
# `shownDay` itself: west of UTC the 19th is the 18th.
# Reddens: unit: task-dates.test.ts "draws a date-only day as that day in every zone, and a timed one on its local day"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = '    ? localAt(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())\n'
b = '    ? localAt(at.getFullYear(), at.getMonth(), at.getDate())\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tpm-1-a-date-only-day-is-its-local-day-unit: a date-only day is read on the instant's local day")
